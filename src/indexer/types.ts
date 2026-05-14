import type {
  BrandContext,
  ResolvedDesignSystem,
  VerbalDoc,
  AudienceDoc,
  MagicTrick,
  MotionSystem,
  TokenSpecimen,
  AssetEntry,
  FontFace,
  DesignComponent,
  DesignCSSFile,
} from '../types/design-system.js';

export interface RawContextData {
  colorsAndType?: DesignCSSFile;
  components: DesignComponent[];
  tokens: TokenSpecimen[];
  assets: AssetEntry[];
  fonts: FontFace[];
  motion?: MotionSystem;
}

export interface VerbalLayer {
  positioning: VerbalDoc | undefined;
  audience: AudienceDoc | undefined;
  messaging: VerbalDoc | undefined;
  differentiation: VerbalDoc | undefined;
  concepts: VerbalDoc | undefined;
  voice: VerbalDoc | undefined;
}

export interface DesignSystemIndex {
  brandName: string;
  brandDescription?: string;
  brandRoot: string;
  lastIndexed: Date;
  magicTrick: MagicTrick | undefined;
  verbal: VerbalLayer;
  base: RawContextData;
  web: RawContextData;
  product: RawContextData;
  resolved: Record<BrandContext, ResolvedDesignSystem>;
  warnings: string[];
}
