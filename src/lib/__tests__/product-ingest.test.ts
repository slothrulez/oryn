import { describe, it, expect } from "vitest";
import {
  parseProductFromHtml,
  decodeEntities,
  getMeta,
  toAbsolute,
  extractJsonLdProduct,
} from "@/lib/product-ingest";

describe("product-ingest helpers", () => {
  it("decodeEntities decodes common entities and normalizes whitespace", () => {
    expect(decodeEntities("A &amp; B&#39;s  caf&#xe9;")).toBe("A & B's café");
  });
  it("getMeta handles property/name and attribute order", () => {
    expect(getMeta(`<meta property="og:title" content="Hi">`, ["og:title"])).toBe("Hi");
    expect(getMeta(`<meta content="Yo" name="twitter:title">`, ["twitter:title"])).toBe("Yo");
  });
  it("toAbsolute resolves relative paths", () => {
    expect(toAbsolute("/img/a.jpg", "https://shop.com/p/1")).toBe("https://shop.com/img/a.jpg");
    expect(toAbsolute("https://cdn.com/x.jpg", "https://shop.com")).toBe("https://cdn.com/x.jpg");
  });
});

describe("parseProductFromHtml", () => {
  it("JSON-LD Product first: takes name/price (with currency)/description/images", () => {
    const html = `<html><head><title>Store</title>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "CloudSoft thick tissues",
        description: "3-ply thick, a must-stock",
        image: ["https://cdn.shop.com/a.jpg", "https://cdn.shop.com/b.jpg"],
        offers: { "@type": "Offer", price: "39.9", priceCurrency: "EUR" },
      })}</script></head><body></body></html>`;
    const p = parseProductFromHtml(html, "https://shop.com/p/1");
    expect(p.title).toBe("CloudSoft thick tissues");
    expect(p.priceText).toBe("€39.9");
    expect(p.description).toContain("a must-stock");
    expect(p.images).toEqual(["https://cdn.shop.com/a.jpg", "https://cdn.shop.com/b.jpg"]);
  });

  it("JSON-LD Product is also found inside an @graph array", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [{ "@type": "WebSite" }, { "@type": "Product", name: "X", offers: { price: 5.9, priceCurrency: "USD" } }],
    })}</script>`;
    const node = extractJsonLdProduct(html);
    expect(node?.name).toBe("X");
    expect(parseProductFromHtml(html, "https://s.com").priceText).toBe("$5.9");
  });

  it("no JSON-LD → OpenGraph fallback (relative images become absolute)", () => {
    const html = `<head>
      <meta property="og:title" content="serum 30ml">
      <meta property="og:description" content="firming anti-aging">
      <meta property="og:image" content="/static/serum.jpg">
      <meta property="product:price:amount" content="129">
      <meta property="product:price:currency" content="USD">
    </head>`;
    const p = parseProductFromHtml(html, "https://brand.com/products/serum");
    expect(p.title).toBe("serum 30ml");
    expect(p.description).toBe("firming anti-aging");
    expect(p.priceText).toBe("$129");
    expect(p.images).toEqual(["https://brand.com/static/serum.jpg"]);
  });

  it("no JSON-LD / no OG → <title> + meta description fallback", () => {
    const html = `<head><title>magic mop - ShopMart</title><meta name="description" content="one swipe and clean"></head>`;
    const p = parseProductFromHtml(html, "https://x.shopmart.com/item");
    expect(p.title).toBe("magic mop - ShopMart");
    expect(p.description).toBe("one swipe and clean");
    expect(p.images).toEqual([]);
  });

  it("images are deduped (the same JSON-LD and og:image image is kept once)", () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "A", image: "https://c.com/x.jpg" })}</script>
      <meta property="og:image" content="https://c.com/x.jpg">
      <meta name="twitter:image" content="https://c.com/y.jpg">`;
    const p = parseProductFromHtml(html, "https://c.com");
    expect(p.images).toEqual(["https://c.com/x.jpg", "https://c.com/y.jpg"]);
  });
});

// Regression suite for parsing bugs (reproduced from audit workflow): apostrophe truncation / double-decode / duplicate price symbol / $0
describe("product-ingest parsing robustness regressions", () => {
  it("getMeta: single quotes inside double-quoted content are not truncated", () => {
    expect(getMeta(`<meta property="og:title" content="Tom's Coffee Mug">`, ["og:title"])).toBe("Tom's Coffee Mug");
  });
  it("getMeta: double quotes inside single-quoted content are not truncated", () => {
    expect(getMeta(`<meta name="twitter:title" content='Say "Hi" now'>`, ["twitter:title"])).toBe('Say "Hi" now');
  });
  it("getMeta: existing simple cases do not regress", () => {
    expect(getMeta(`<meta property="og:title" content="Hi">`, ["og:title"])).toBe("Hi");
    expect(getMeta(`<meta content="Yo" name="twitter:title">`, ["twitter:title"])).toBe("Yo");
  });
  it("decodeEntities: already-escaped entities are not double-decoded (&amp;#39; stays &#39;)", () => {
    expect(decodeEntities("Tom&amp;#39;s")).toBe("Tom&#39;s");
    expect(decodeEntities("5 &amp;lt; 10")).toBe("5 &lt; 10");
  });
  it("decodeEntities: existing mixed cases do not regress", () => {
    expect(decodeEntities("A &amp; B&#39;s  caf&#xe9;")).toBe("A & B's café");
  });
  it("price: an existing symbol is not added twice ($19.99 does not become $$19.99)", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "X", offers: { price: "$19.99", priceCurrency: "USD" } })}</script>`;
    expect(parseProductFromHtml(html, "https://s.com").priceText).toBe("$19.99");
  });
  it("price: 0 / negatives are invalid (no $0 output)", () => {
    const mk = (price: unknown) => `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "X", offers: { price, priceCurrency: "USD" } })}</script>`;
    expect(parseProductFromHtml(mk(0), "https://s.com").priceText).toBeUndefined();
    expect(parseProductFromHtml(mk("-5"), "https://s.com").priceText).toBeUndefined();
  });
  it("price: plain numbers get the symbol normally", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "X", offers: { price: 19.99, priceCurrency: "USD" } })}</script>`;
    expect(parseProductFromHtml(html, "https://s.com").priceText).toBe("$19.99");
  });
  it("parsing: apostrophe titles + prices with their own symbol are correct end to end", () => {
    const html = `<head>
      <meta property="og:title" content="L'Oréal Men's Serum">
      <script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "", offers: { price: "$29.90", priceCurrency: "USD" } })}</script>
    </head>`;
    const p = parseProductFromHtml(html, "https://shop.com/p");
    expect(p.title).toBe("L'Oréal Men's Serum");
    expect(p.priceText).toBe("$29.90");
  });
});
