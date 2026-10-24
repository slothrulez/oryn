import { describe, it, expect, beforeEach } from "vitest";
import { useProductLibraryStore } from "../product-library-store";
import { useTemplateStore } from "../template-store";
import { useBrandStore } from "../brand-store";
import { useCharacterStore, useProjectStore } from "../project-store";
import type { ProductItem } from "../product-library-store";
import type { ScriptTemplate } from "../template-store";
import type { Character } from "../project-store";
import type { Shot } from "@/lib/db/schema";

// ==================== ProductLibrary Store Tests ====================

describe("ProductLibraryStore", () => {
  beforeEach(() => {
    // reset store state before each test
    useProductLibraryStore.setState({ products: [] });
  });

  /** Create product test data */
  function createProduct(overrides?: Partial<ProductItem>): ProductItem {
    return {
      id: "product-1",
      name: "Test product",
      category: "beauty",
      description: "this is a test product",
      images: ["https://example.com/img.jpg"],
      price: "$99.90",
      targetAudience: "young woman",
      videoCount: 0,
      createdAt: new Date("2026-01-01"),
      ...overrides,
    };
  }

  it("adds a product", () => {
    const product = createProduct();
    useProductLibraryStore.getState().addProduct(product);

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Test product");
    expect(products[0].category).toBe("beauty");
    expect(products[0].videoCount).toBe(0);
  });

  it("adds multiple products", () => {
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p1", name: "Product A" }));
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p2", name: "Product B" }));

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(2);
    expect(products[0].name).toBe("Product A");
    expect(products[1].name).toBe("Product B");
  });

  it("updates a product", () => {
    const product = createProduct();
    useProductLibraryStore.getState().addProduct(product);
    useProductLibraryStore.getState().updateProduct("product-1", {
      name: "Updated product",
      price: "$199",
    });

    const { products } = useProductLibraryStore.getState();
    expect(products[0].name).toBe("Updated product");
    expect(products[0].price).toBe("$199");
    // other fields remain unchanged
    expect(products[0].category).toBe("beauty");
  });

  it("updating a missing product does not error or change data", () => {
    const product = createProduct();
    useProductLibraryStore.getState().addProduct(product);
    useProductLibraryStore.getState().updateProduct("non-existent-id", {
      name: "should not take effect",
    });

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Test product");
  });

  it("deletes a product", () => {
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p1" }));
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p2" }));
    useProductLibraryStore.getState().removeProduct("p1");

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe("p2");
  });

  it("deleting a missing product does not error", () => {
    useProductLibraryStore.getState().addProduct(createProduct());
    // deleting a non-existent id should not throw
    expect(() => {
      useProductLibraryStore.getState().removeProduct("non-existent-id");
    }).not.toThrow();

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(1);
  });

  it("increments the video count", () => {
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p1", videoCount: 0 }));
    useProductLibraryStore.getState().incrementVideoCount("p1");
    useProductLibraryStore.getState().incrementVideoCount("p1");

    const { products } = useProductLibraryStore.getState();
    expect(products[0].videoCount).toBe(2);
  });

  it("incrementing the video count of a missing product does not error", () => {
    useProductLibraryStore.getState().addProduct(createProduct());
    expect(() => {
      useProductLibraryStore.getState().incrementVideoCount("non-existent-id");
    }).not.toThrow();

    // existing data must not be affected
    const { products } = useProductLibraryStore.getState();
    expect(products[0].videoCount).toBe(0);
  });

  it("createdAt is a Date", () => {
    const product = createProduct({ createdAt: new Date("2026-03-01T10:00:00Z") });
    useProductLibraryStore.getState().addProduct(product);

    const { products } = useProductLibraryStore.getState();
    expect(products[0].createdAt).toBeInstanceOf(Date);
    expect(products[0].createdAt.toISOString()).toBe("2026-03-01T10:00:00.000Z");
  });
});

// ==================== Template Store Tests ====================

describe("TemplateStore", () => {
  beforeEach(() => {
    useTemplateStore.setState({ templates: [] });
  });

  /** Create template test data */
  function createTemplate(overrides?: Partial<ScriptTemplate>): ScriptTemplate {
    const defaultShot: Shot = {
      shotId: 1,
      type: "hook",
      duration: 3,
      description: "attention-grabbing opening",
      camera: "zoom_in",
      visualSource: "ai_generate",
      transition: "ai_start_end",
      voiceover: "have you ever run into this problem?",
    };
    return {
      id: "template-1",
      name: "Test template",
      description: "pain-point script template",
      category: "beauty",
      videoMode: "product_closeup",
      styleType: "pain_point",
      shots: [defaultShot],
      totalDuration: 30,
      sourceProjectId: "project-1",
      useCount: 0,
      createdAt: new Date("2026-01-01"),
      ...overrides,
    };
  }

  it("adds a template", () => {
    const template = createTemplate();
    useTemplateStore.getState().addTemplate(template);

    const { templates } = useTemplateStore.getState();
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("Test template");
    expect(templates[0].shots).toHaveLength(1);
    expect(templates[0].useCount).toBe(0);
  });

  it("deletes a template", () => {
    useTemplateStore.getState().addTemplate(createTemplate({ id: "t1" }));
    useTemplateStore.getState().addTemplate(createTemplate({ id: "t2" }));
    useTemplateStore.getState().removeTemplate("t1");

    const { templates } = useTemplateStore.getState();
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe("t2");
  });

  it("deleting a missing template does not error", () => {
    useTemplateStore.getState().addTemplate(createTemplate());
    expect(() => {
      useTemplateStore.getState().removeTemplate("non-existent-id");
    }).not.toThrow();

    const { templates } = useTemplateStore.getState();
    expect(templates).toHaveLength(1);
  });

  it("increments the use count", () => {
    useTemplateStore.getState().addTemplate(createTemplate({ id: "t1", useCount: 0 }));
    useTemplateStore.getState().incrementUseCount("t1");
    useTemplateStore.getState().incrementUseCount("t1");
    useTemplateStore.getState().incrementUseCount("t1");

    const { templates } = useTemplateStore.getState();
    expect(templates[0].useCount).toBe(3);
  });

  it("incrementing the use count of a missing template does not error", () => {
    useTemplateStore.getState().addTemplate(createTemplate());
    expect(() => {
      useTemplateStore.getState().incrementUseCount("non-existent-id");
    }).not.toThrow();

    const { templates } = useTemplateStore.getState();
    expect(templates[0].useCount).toBe(0);
  });

  it("createdAt is a Date", () => {
    const template = createTemplate({ createdAt: new Date("2026-06-15T08:00:00Z") });
    useTemplateStore.getState().addTemplate(template);

    const { templates } = useTemplateStore.getState();
    expect(templates[0].createdAt).toBeInstanceOf(Date);
  });
});

// ==================== Brand Store Tests ====================

describe("BrandStore", () => {
  beforeEach(() => {
    // reset to default values
    useBrandStore.setState({
      brand: {
        id: "test-brand-id",
        name: "My store",
        primaryColor: "#6366f1",
        secondaryColor: "#8b5cf6",
        fontFamily: "Default font",
        watermark: {
          enabled: false,
          position: "bottom-right",
          opacity: 0.3,
          scale: 0.15,
        },
        introEnabled: false,
        outroEnabled: false,
      },
    });
  });

  it("defaults are correct", () => {
    const { brand } = useBrandStore.getState();
    expect(brand.name).toBe("My store");
    expect(brand.primaryColor).toBe("#6366f1");
    expect(brand.secondaryColor).toBe("#8b5cf6");
    expect(brand.fontFamily).toBe("Default font");
    expect(brand.introEnabled).toBe(false);
    expect(brand.outroEnabled).toBe(false);
  });

  it("default watermark config is correct", () => {
    const { brand } = useBrandStore.getState();
    expect(brand.watermark.enabled).toBe(false);
    expect(brand.watermark.position).toBe("bottom-right");
    expect(brand.watermark.opacity).toBe(0.3);
    expect(brand.watermark.scale).toBe(0.15);
  });

  it("updates brand info (shallow merge)", () => {
    useBrandStore.getState().updateBrand({
      name: "New store name",
      primaryColor: "#ff0000",
      outroEnabled: true,
      outroText: "Thanks for watching",
    });

    const { brand } = useBrandStore.getState();
    expect(brand.name).toBe("New store name");
    expect(brand.primaryColor).toBe("#ff0000");
    expect(brand.outroEnabled).toBe(true);
    expect(brand.outroText).toBe("Thanks for watching");
    // fields not updated must remain unchanged
    expect(brand.secondaryColor).toBe("#8b5cf6");
    expect(brand.fontFamily).toBe("Default font");
  });

  it("updating brand info does not overwrite the watermark config", () => {
    useBrandStore.getState().updateBrand({ name: "New name" });

    const { brand } = useBrandStore.getState();
    // watermark config should remain intact
    expect(brand.watermark.enabled).toBe(false);
    expect(brand.watermark.position).toBe("bottom-right");
  });

  it("updates the watermark config (shallow merge)", () => {
    useBrandStore.getState().updateWatermark({
      enabled: true,
      opacity: 0.8,
    });

    const { brand } = useBrandStore.getState();
    expect(brand.watermark.enabled).toBe(true);
    expect(brand.watermark.opacity).toBe(0.8);
    // watermark fields not updated must remain unchanged
    expect(brand.watermark.position).toBe("bottom-right");
    expect(brand.watermark.scale).toBe(0.15);
  });

  it("updates the watermark position", () => {
    useBrandStore.getState().updateWatermark({ position: "top-left" });

    const { brand } = useBrandStore.getState();
    expect(brand.watermark.position).toBe("top-left");
  });

  it("sets the logo", () => {
    useBrandStore.getState().updateBrand({
      logoUrl: "https://example.com/logo.png",
    });

    const { brand } = useBrandStore.getState();
    expect(brand.logoUrl).toBe("https://example.com/logo.png");
  });
});

// ==================== Character Store Tests ====================

describe("CharacterStore", () => {
  beforeEach(() => {
    useCharacterStore.setState({ characters: [] });
  });

  /** Create character test data */
  function createCharacter(overrides?: Partial<Character>): Character {
    return {
      id: "char-1",
      name: "Mia",
      description: "25-year-old girl, lively and cheerful",
      appearance: "young woman with long black hair",
      referenceImages: ["https://example.com/ref1.jpg"],
      voiceProfile: { style: "gentle female voice", speed: 1.0, emotion: "happy" },
      isDefault: false,
      ...overrides,
    };
  }

  it("adds a character", () => {
    const char = createCharacter();
    useCharacterStore.getState().addCharacter(char);

    const { characters } = useCharacterStore.getState();
    expect(characters).toHaveLength(1);
    expect(characters[0].name).toBe("Mia");
    expect(characters[0].referenceImages).toHaveLength(1);
  });

  it("adds multiple characters", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1", name: "Mia" }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c2", name: "Max" }));

    const { characters } = useCharacterStore.getState();
    expect(characters).toHaveLength(2);
  });

  it("updates a character", () => {
    useCharacterStore.getState().addCharacter(createCharacter());
    useCharacterStore.getState().updateCharacter("char-1", {
      name: "Mia (updated)",
      appearance: "young woman with short hair",
    });

    const { characters } = useCharacterStore.getState();
    expect(characters[0].name).toBe("Mia (updated)");
    expect(characters[0].appearance).toBe("young woman with short hair");
    // fields not updated must remain unchanged
    expect(characters[0].description).toBe("25-year-old girl, lively and cheerful");
  });

  it("updating a missing character does not error", () => {
    useCharacterStore.getState().addCharacter(createCharacter());
    expect(() => {
      useCharacterStore.getState().updateCharacter("non-existent-id", { name: "does not exist" });
    }).not.toThrow();

    const { characters } = useCharacterStore.getState();
    expect(characters[0].name).toBe("Mia");
  });

  it("deletes a character", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1" }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c2" }));
    useCharacterStore.getState().removeCharacter("c1");

    const { characters } = useCharacterStore.getState();
    expect(characters).toHaveLength(1);
    expect(characters[0].id).toBe("c2");
  });

  it("deleting a missing character does not error", () => {
    useCharacterStore.getState().addCharacter(createCharacter());
    expect(() => {
      useCharacterStore.getState().removeCharacter("non-existent-id");
    }).not.toThrow();

    const { characters } = useCharacterStore.getState();
    expect(characters).toHaveLength(1);
  });

  it("gets the default character", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1", isDefault: false }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c2", isDefault: true }));

    const defaultChar = useCharacterStore.getState().getDefault();
    expect(defaultChar).toBeDefined();
    expect(defaultChar!.id).toBe("c2");
  });

  it("returns undefined when there is no default character", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ isDefault: false }));

    const defaultChar = useCharacterStore.getState().getDefault();
    expect(defaultChar).toBeUndefined();
  });

  it("sets as default (unsets other defaults)", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1", isDefault: true }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c2", isDefault: false }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c3", isDefault: false }));

    // set c2 as the default
    useCharacterStore.getState().setDefault("c2");

    const { characters } = useCharacterStore.getState();
    expect(characters.find((c) => c.id === "c1")!.isDefault).toBe(false);
    expect(characters.find((c) => c.id === "c2")!.isDefault).toBe(true);
    expect(characters.find((c) => c.id === "c3")!.isDefault).toBe(false);

    // getDefault should also return c2
    const defaultChar = useCharacterStore.getState().getDefault();
    expect(defaultChar!.id).toBe("c2");
  });

  it("set as default: calling with a missing id does not error", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1", isDefault: true }));

    expect(() => {
      useCharacterStore.getState().setDefault("non-existent-id");
    }).not.toThrow();

    // all characters will have isDefault set to false (since no id matches)
    const { characters } = useCharacterStore.getState();
    expect(characters[0].isDefault).toBe(false);
  });
});

// ==================== Project Store Tests ====================

describe("ProjectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({
      currentProject: null,
      projects: [],
      currentStep: "upload",
      currentCharacter: null,
    });
  });

  it("sets the current project", () => {
    const project = {
      id: "proj-1",
      name: "Test project",
      status: "draft",
      productImages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    useProjectStore.getState().setCurrentProject(project);

    const { currentProject } = useProjectStore.getState();
    expect(currentProject).not.toBeNull();
    expect(currentProject!.name).toBe("Test project");
  });

  it("sets the current step", () => {
    useProjectStore.getState().setCurrentStep("script");
    expect(useProjectStore.getState().currentStep).toBe("script");

    useProjectStore.getState().setCurrentStep("assets");
    expect(useProjectStore.getState().currentStep).toBe("assets");
  });

  it("updating the project also syncs the projects array", () => {
    const project = {
      id: "proj-1",
      name: "Original name",
      status: "draft",
      productImages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // set both currentProject and projects at once
    useProjectStore.setState({
      currentProject: project,
      projects: [project],
    });

    useProjectStore.getState().updateProject({ name: "Updated name" });

    const { currentProject, projects } = useProjectStore.getState();
    // currentProject should be updated
    expect(currentProject!.name).toBe("Updated name");
    // the corresponding entry in the projects array should also be updated
    expect(projects[0].name).toBe("Updated name");
  });

  it("updateProject does not error without a currentProject", () => {
    expect(() => {
      useProjectStore.getState().updateProject({ name: "should not take effect" });
    }).not.toThrow();

    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it("sets the current character", () => {
    const character: Character = {
      id: "char-1",
      name: "Mia",
      referenceImages: [],
    };
    useProjectStore.getState().setCurrentCharacter(character);

    expect(useProjectStore.getState().currentCharacter).not.toBeNull();
    expect(useProjectStore.getState().currentCharacter!.name).toBe("Mia");
  });

  it("clears the current character", () => {
    useProjectStore.getState().setCurrentCharacter({
      id: "char-1",
      name: "Mia",
      referenceImages: [],
    });
    useProjectStore.getState().setCurrentCharacter(null);

    expect(useProjectStore.getState().currentCharacter).toBeNull();
  });

  it("setProjects replaces the whole list", () => {
    const projects = [
      { id: "p1", name: "Project 1", status: "draft", productImages: [] as string[], createdAt: new Date(), updatedAt: new Date() },
      { id: "p2", name: "Project 2", status: "draft", productImages: [] as string[], createdAt: new Date(), updatedAt: new Date() },
    ];
    useProjectStore.getState().setProjects(projects);

    expect(useProjectStore.getState().projects).toHaveLength(2);

    // replace with an empty list
    useProjectStore.getState().setProjects([]);
    expect(useProjectStore.getState().projects).toHaveLength(0);
  });
});
