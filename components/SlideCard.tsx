import React from 'react';
import { SlideData } from '../types';
import { Loader2, Image as ImageIcon, AlertCircle, RefreshCw, Wand2, Film } from 'lucide-react';

interface SlideCardProps {
  slide: SlideData;
  index: number;
  onRegenerate: (id: number, visualDirective: string) => void;
  onEdit: (id: number) => void;
  onGenerateVideo: (id: number, visualDirective: string) => void;
}

export const SlideCard: React.FC<SlideCardProps> = ({ slide, index, onRegenerate, onEdit, onGenerateVideo }) => {
  return (
    <div className="relative flex-shrink-0 w-[320px] h-[400px] bg-neutral-900 rounded-xl overflow-hidden shadow-2xl border border-neutral-800 group transition-transform hover:scale-[1.02] hover:border-orange-500/30">
      
      {/* Media Layer */}
      <div className="absolute inset-0 w-full h-full bg-neutral-800">
        {slide.videoUrl ? (
          <video 
            src={slide.videoUrl} 
            controls 
            className="w-full h-full object-cover"
            loop
          />
        ) : slide.imageUrl ? (
          <img 
            src={slide.imageUrl} 
            alt={slide.visualDirective} 
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-700"
          />
        ) : (slide.isGeneratingImage || slide.isGeneratingVideo) ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            <span className="text-xs font-medium uppercase tracking-widest text-orange-500/80">
              {slide.isGeneratingVideo ? 'Creating Video...' : 'Generating Visual...'}
            </span>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-neutral-500 p-6 text-center">
             <AlertCircle className="w-8 h-8 mb-2 text-red-500/50" />
             <p className="text-xs">Generation failed</p>
          </div>
        )}
      </div>

      {/* Gradient Overlay for Text Readability (Only show if not playing video or if video is paused/initial) */}
      {!slide.videoUrl && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />
      )}

      {/* Action Buttons (Visible on Hover) */}
      <div className="absolute top-3 right-3 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onGenerateVideo(slide.id, slide.visualDirective);
          }}
          disabled={slide.isGeneratingImage || slide.isGeneratingVideo}
          className="p-2 bg-neutral-950/60 hover:bg-orange-600 text-white rounded-full backdrop-blur-md transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:border-orange-500"
          title="Generate Video Version"
        >
          <Film className={`w-4 h-4 ${slide.isGeneratingVideo ? 'animate-pulse' : ''}`} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(slide.id);
          }}
          disabled={slide.isGeneratingImage || slide.isGeneratingVideo || !slide.imageUrl}
          className="p-2 bg-neutral-950/60 hover:bg-orange-600 text-white rounded-full backdrop-blur-md transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:border-orange-500"
          title="Edit Image with Text Prompt"
        >
          <Wand2 className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRegenerate(slide.id, slide.visualDirective);
          }}
          disabled={slide.isGeneratingImage || slide.isGeneratingVideo}
          className="p-2 bg-neutral-950/60 hover:bg-orange-600 text-white rounded-full backdrop-blur-md transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:border-orange-500"
          title="Regenerate Image"
        >
          <RefreshCw className={`w-4 h-4 ${slide.isGeneratingImage ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content Layer */}
      {!slide.videoUrl && (
        <div className="absolute inset-0 p-6 flex flex-col justify-end text-white z-10 pointer-events-none">
          <div className="mb-auto pt-2 flex justify-between items-start opacity-40 text-[10px] uppercase tracking-widest font-bold text-orange-200">
             <span>Slide {index + 1}</span>
             <span>Nano</span>
          </div>

          <div className="transform transition-transform duration-500 translate-y-0">
            <h2 className="text-xl font-bold font-serif leading-tight mb-3 text-white drop-shadow-lg">
              {slide.headline}
            </h2>
            <p className="text-xs font-medium text-slate-300 leading-relaxed drop-shadow-md">
              {slide.subtext}
            </p>
          </div>
        </div>
      )}
      
      {/* Hover info for Visual Directive (Debugging/Interest) */}
      <div className="absolute top-0 left-0 w-full p-4 bg-black/90 backdrop-blur-md transform -translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-20 pointer-events-none border-b border-orange-500/20">
        <p className="text-[10px] text-orange-500 uppercase tracking-wide font-bold mb-1">Visual Directive</p>
        <p className="text-xs text-slate-400 italic line-clamp-3">{slide.visualDirective}</p>
      </div>
    </div>
  );
};