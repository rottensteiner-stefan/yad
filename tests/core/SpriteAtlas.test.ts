import { describe, expect, it } from "vitest";
import { sliceFaceSprites } from "../../src/core/SpriteAtlas.js";

describe("SpriteAtlas", () => {
  it("slices a face sprite strip into individual frames", async () => {
    const origImage = globalThis.Image;
    const origDocument = globalThis.document;

    class MockCanvas {
      public width = 0;
      public height = 0;
      public getContext() {
        return {
          imageSmoothingEnabled: false,
          drawImage: () => {},
        };
      }
    }

    class MockImage {
      public width = 24;
      public height = 180;
      public crossOrigin = "";
      public _src = "";
      public onload: (() => void) | null = null;
      public get src(): string {
        return this._src;
      }
      public set src(val: string) {
        this._src = val;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 1);
      }
    }

    // @ts-expect-error Mocking globals for pure headless test
    globalThis.Image = MockImage;
    // Cast via unknown to mock minimal document.createElement for canvas
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => new MockCanvas() as unknown as HTMLCanvasElement,
    };

    try {
      const faces = await sliceFaceSprites({
        atlasUrl: "/assets/dungeon_pack/sprites/dungeonguy.webp",
        faceCount: 6,
        faceHeight: 30,
        maxFaceWidth: 24,
        outputWidth: 24,
        outputHeight: 30,
      });

      expect(faces).toHaveLength(6);
      expect(faces[0]!.width).toBe(24);
      expect(faces[0]!.height).toBe(30);
    } finally {
      globalThis.Image = origImage;
      (globalThis as unknown as { document: unknown }).document = origDocument;
    }
  });
});
