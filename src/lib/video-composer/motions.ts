// product image camera motion effects — based on the FFmpeg zoompan filter
// used for product showcase shots; keeps AI away from product images by substituting motion templates
import { interpolate } from "./easing";

export interface MotionConfig {
  name: string;
  label: string;
  description: string;
  // FFmpeg zoompan filter parameters
  getFilter: (width: number, height: number, duration: number) => string;
}

export const MOTIONS: Record<string, MotionConfig> = {
  zoom_in_slow: {
    name: "zoom_in_slow",
    label: "Slow zoom in",
    description: "Slowly zoom from the wide shot into product detail",
    getFilter: (w, h, d) => {
      const fps = 30;
      const frames = d * fps;
      const z = interpolate("on", frames, 1, 1.5, "easeOut"); // ease-out zoom in, decelerates to rest — more cinematic than linear
      return `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
  },
  zoom_out_slow: {
    name: "zoom_out_slow",
    label: "Slow zoom out",
    description: "Slowly zoom out from product detail to the wide shot",
    getFilter: (w, h, d) => {
      const fps = 30;
      const frames = d * fps;
      const z = interpolate("on", frames, 1.5, 1, "easeOut"); // ease-out zoom out
      return `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
  },
  pan_left: {
    name: "pan_left",
    label: "Pan left",
    description: "Camera pans right to left across the product",
    getFilter: (w, h, d) => {
      const fps = 30;
      const frames = d * fps;
      return `zoompan=z='1.3':x='iw/2-(iw/zoom/2)+on*(iw/zoom/${frames}*0.3)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
  },
  pan_right: {
    name: "pan_right",
    label: "Pan right",
    description: "Camera pans left to right across the product",
    getFilter: (w, h, d) => {
      const fps = 30;
      const frames = d * fps;
      return `zoompan=z='1.3':x='iw/2-(iw/zoom/2)-on*(iw/zoom/${frames}*0.3)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
  },
  ken_burns: {
    name: "ken_burns",
    label: "Ken Burns",
    description: "Classic documentary effect: slow zoom with a gentle pan",
    getFilter: (w, h, d) => {
      const fps = 30;
      const frames = d * fps;
      const z = interpolate("on", frames, 1, 1.3, "easeOut"); // ease-out zoom in + gentle pan
      // pan speed proportional to input width (0.00046·iw ≈ the old 0.5px/frame on a 1080-wide
      // canvas), so the motion reads the same at any canvas scale — including the composer's
      // 2x supersampled canvas — instead of halving/doubling with resolution
      return `zoompan=z='${z}':x='iw/2-(iw/zoom/2)+on*(iw*0.00046)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
  },
  bounce: {
    name: "bounce",
    label: "Bounce",
    description: "The product bounces into frame from small to large",
    getFilter: (w, h, d) => {
      const fps = 30;
      const frames = d * fps;
      return `zoompan=z='if(lt(on,${Math.floor(frames * 0.3)}),1+on*0.02,if(lt(on,${Math.floor(frames * 0.5)}),1.6-(on-${Math.floor(frames * 0.3)})*0.01,1.4))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
  },
  // static: no camera motion, just hold the frame for the given duration (output format matches other motion effects so it can be concatenated with them)
  static: {
    name: "static",
    label: "Static",
    description: "Frame holds still, no camera move",
    getFilter: (w, h, d) => {
      const fps = 30;
      const frames = d * fps;
      return `zoompan=z='1':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },
  },
};

// default motion: fallback when the specified motion key is invalid, preventing the clip from being silently dropped
export const DEFAULT_MOTION = "ken_burns";

// get the list of available motion effects
export function getMotionList(): MotionConfig[] {
  return Object.values(MOTIONS);
}
