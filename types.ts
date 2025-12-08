
export interface SlideData {
  id: number;
  headline: string;
  subtext: string;
  visualDirective: string;
  imageUrl?: string; // Base64 or URL
  videoUrl?: string; // Blob URL for generated video
  isGeneratingImage: boolean;
  isGeneratingVideo?: boolean;
}

export interface GenerationStatus {
  step: 'idle' | 'parsing' | 'generating_images' | 'complete' | 'error';
  message?: string;
  progress?: number; // 0 to 100
}

export type AspectRatio = '1:1' | '3:4' | '4:5' | '4:3' | '9:16' | '16:9';
export type ImageResolution = '1K';

export type VisualStyle = 
  | 'cinematic' 
  | 'minimalist' 
  | 'cyberpunk' 
  | 'watercolor' 
  | 'corporate' 
  | 'noir' 
  | 'anime';

export interface ImageSettings {
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  style: VisualStyle;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}
