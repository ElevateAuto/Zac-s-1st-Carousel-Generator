
import React, { useState, useEffect } from 'react';
import { SlideData, GenerationStatus, AspectRatio, ImageResolution, ImageSettings, VisualStyle, TextDensity } from './types';
import { parseSlidesFromText, generateSlideImage, editSlideImage, refineText, generateScriptFromTopic, generateSlideVideo } from './services/geminiService';
import { SlideCard } from './components/SlideCard';
import { Sparkles, RotateCcw, Copy, Check, Grid, Columns, FileArchive, FileText, Wand2, Settings2, X, Send, PenTool, Lightbulb, Key, Film, AlignLeft } from 'lucide-react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

const SAMPLE_TEXT = `SLIDE 1
Headline: Your Children Don't Want Your Success
Subtext: They are starving for the one thing you’re too busy to give.
Caption: Many fathers believe that financial success is the ultimate gift they can give their children. But in reality, what children crave most is not your money, but your time. Success is hollow if you are a stranger in your own home.
Visual Directive: Black and white photo of a small child looking up at a father who is looking at his phone. High contrast, moody lighting.

SLIDE 2
Headline: Provision Without Presence Is Empty
Subtext: A full bank account never replaces an empty chair.
Caption: You can buy them the best toys, the best schools, and the best clothes. But you cannot buy memories. An empty chair at the dinner table speaks louder than any paycheck. Presence is the highest form of provision.
Visual Directive: An empty chair at a family dining table with warm light spilling onto it from a window. Cinematic style.

SLIDE 3
Headline: They Watch Your Life, Not Lectures
Subtext: Your kids learn resilience from how you live.
Caption: Children are mimics. They don't do what you say; they do what you do. If you want them to be resilient, honest, and kind, you must embody those traits yourself. Your life is the curriculum.
Visual Directive: Close up of a father tying his shoes or fixing a tool, with a child’s hands mimicking the action nearby.`;

const App: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  const [topicInput, setTopicInput] = useState<string>('');
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [status, setStatus] = useState<GenerationStatus>({ step: 'idle' });
  const [hasCopied, setHasCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'carousel' | 'grid'>('carousel');
  const [isDownloading, setIsDownloading] = useState(false);

  // Settings State
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('cinematic');
  const [textDensity, setTextDensity] = useState<TextDensity>('standard');
  const resolution: ImageResolution = '1K';

  // Edit State
  const [editingSlideId, setEditingSlideId] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);

  const [isRefining, setIsRefining] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  const handleApiError = (error: any) => {
    const errorMsg = error.message || error.toString();
    setStatus({ step: 'error', message: errorMsg || 'Something went wrong. Please try again.' });
  };

  const handleCopySample = () => {
    setInputText(SAMPLE_TEXT);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const handleRefineText = async () => {
    if (!inputText.trim()) return;
    setIsRefining(true);
    try {
      const refined = await refineText(inputText, textDensity);
      setInputText(refined);
    } catch (e: any) {
      console.error("Refine failed", e);
      handleApiError(e);
    } finally {
      setIsRefining(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!topicInput.trim()) return;
    setIsGeneratingScript(true);
    try {
      const script = await generateScriptFromTopic(topicInput, textDensity);
      setInputText(script);
    } catch (e: any) {
      console.error("Script generation failed", e);
      handleApiError(e);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const processSlides = async () => {
    if (!inputText.trim()) return;

    setStatus({ step: 'parsing', message: 'Analyzing text structure...' });
    setSlides([]); // Reset
    setViewMode('carousel');

    try {
      // Step 1: Parse
      const parsedSlides = await parseSlidesFromText(inputText);
      
      // Initialize slides with loading state
      const initialSlides: SlideData[] = parsedSlides.map((s, i) => ({
        ...s,
        id: i,
        isGeneratingImage: true,
      }));
      setSlides(initialSlides);

      setStatus({ 
        step: 'generating_images', 
        message: 'Dreaming up visuals...',
        progress: 0 
      });

      const settings: ImageSettings = { aspectRatio, resolution, style: visualStyle };
      
      // Step 2: Generate Images in parallel batches
      // Reduced concurrency to 1 to ensure stability with heavier Pro/2K model
      const CONCURRENCY_LIMIT = 1;
      let completedCount = 0;
      const total = initialSlides.length;

      for (let i = 0; i < total; i += CONCURRENCY_LIMIT) {
        const batch = initialSlides.slice(i, i + CONCURRENCY_LIMIT);
        
        await Promise.all(batch.map(async (slide) => {
          try {
            const base64Image = await generateSlideImage(slide.visualDirective, settings);
            
            setSlides(prev => prev.map(s => 
              s.id === slide.id 
                ? { ...s, imageUrl: base64Image, isGeneratingImage: false }
                : s
            ));
          } catch (error: any) {
             console.error(`Failed to generate image for slide ${slide.id}`, error);
             setSlides(prev => prev.map(s => 
              s.id === slide.id 
                ? { ...s, isGeneratingImage: false } 
                : s
            ));
            
            const errorMsg = error.toString().toLowerCase();
            if (errorMsg.includes('permission denied') || errorMsg.includes('requested entity was not found')) {
               handleApiError(error);
            }
          } finally {
            completedCount++;
            setStatus(prev => ({
              ...prev,
              progress: Math.round((completedCount / total) * 100),
              message: `Generated slide ${completedCount} of ${total}`
            }));
          }
        }));
      }

      setStatus({ step: 'complete', message: 'All slides generated!' });

    } catch (error) {
      console.error(error);
      handleApiError(error);
    }
  };

  const regenerateSlide = async (id: number, directive: string) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, isGeneratingImage: true } : s));
    
    try {
      const settings: ImageSettings = { aspectRatio, resolution, style: visualStyle };
      const newImage = await generateSlideImage(directive, settings);
      setSlides(prev => prev.map(s => 
        s.id === id 
          ? { ...s, imageUrl: newImage, isGeneratingImage: false }
          : s
      ));
    } catch (error: any) {
      console.error(`Failed to regenerate image for slide ${id}`, error);
      setSlides(prev => prev.map(s => 
        s.id === id 
          ? { ...s, isGeneratingImage: false }
          : s
      ));
      handleApiError(error);
    }
  };

  const handleGenerateVideo = async (id: number, directive: string) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, isGeneratingVideo: true } : s));
    
    try {
      // Use current app aspect ratio setting
      const videoUrl = await generateSlideVideo(directive, aspectRatio, visualStyle);
      setSlides(prev => prev.map(s => 
        s.id === id 
          ? { ...s, videoUrl: videoUrl, isGeneratingVideo: false }
          : s
      ));
    } catch (error: any) {
      console.error(`Failed to generate video for slide ${id}`, error);
      setSlides(prev => prev.map(s => 
        s.id === id 
          ? { ...s, isGeneratingVideo: false }
          : s
      ));
      handleApiError(error);
    }
  };
  
  const generateAllVideos = async () => {
    if (slides.length === 0) return;
    setStatus({ step: 'generating_videos', message: 'Generating videos for all slides...', progress: 0 });
    
    // Process one by one to avoid rate limits
    for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (slide.videoUrl) continue; // Skip if already exists
        
        await handleGenerateVideo(slide.id, slide.visualDirective);
        setStatus(prev => ({
           ...prev,
           progress: Math.round(((i + 1) / slides.length) * 100),
           message: `Generated video ${i + 1} of ${slides.length}`
        }));
    }
    
    setStatus({ step: 'complete', message: 'All videos generated!' });
  };

  const openEditModal = (id: number) => {
    setEditingSlideId(id);
    setEditPrompt("");
  };

  const submitEdit = async () => {
    if (editingSlideId === null || !editPrompt.trim()) return;

    const slide = slides.find(s => s.id === editingSlideId);
    if (!slide || !slide.imageUrl) return;

    setIsApplyingEdit(true);
    // Optimistically show loading on the card
    setSlides(prev => prev.map(s => s.id === editingSlideId ? { ...s, isGeneratingImage: true } : s));
    
    try {
      // Pass the current aspect ratio to maintain size/ratio during edit
      const newImage = await editSlideImage(slide.imageUrl, editPrompt, aspectRatio);
      setSlides(prev => prev.map(s => 
        s.id === editingSlideId 
          ? { ...s, imageUrl: newImage, isGeneratingImage: false }
          : s
      ));
      setEditingSlideId(null); // Close modal
    } catch (error: any) {
      console.error("Edit failed", error);
      setSlides(prev => prev.map(s => 
        s.id === editingSlideId 
          ? { ...s, isGeneratingImage: false }
          : s
      ));
      handleApiError(error);
    } finally {
      setIsApplyingEdit(false);
    }
  };

  /**
   * Helper function to composite text onto an image for downloading.
   */
  const addTextOverlay = async (imageUrl: string, headline: string, subtext: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject('Could not get canvas context');
          return;
        }

        // 1. Draw Image
        ctx.drawImage(img, 0, 0);

        // 2. Draw Gradient (Bottom Up)
        const gradient = ctx.createLinearGradient(0, img.height * 0.4, 0, img.height);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, img.height * 0.4, img.width, img.height * 0.6);

        // 3. Settings
        const margin = img.width * 0.08;
        const bottomPadding = img.height * 0.08;
        let currentY = img.height - bottomPadding;

        // 4. Draw Subtext (Bottom Up) - REMOVED per user request
        // if (subtext) { ... }

        // 5. Draw Headline (Above Subtext)
        if (headline) {
          const headFontSize = img.width * 0.07; // ~7% of width
          ctx.font = `bold ${headFontSize}px Merriweather, serif`;
          ctx.fillStyle = 'white';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;

          const words = headline.split(' ');
          let line = '';
          const lines = [];
          for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > img.width - (margin * 2) && n > 0) {
              lines.push(line);
              line = words[n] + ' ';
            } else {
              line = testLine;
            }
          }
          lines.push(line);

          const lineHeight = headFontSize * 1.2;
          currentY -= (lines.length * lineHeight);
          
          lines.forEach((l, i) => {
            ctx.fillText(l, margin, currentY + (i * lineHeight));
          });
        }

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = (e) => reject(e);
      img.src = imageUrl;
    });
  };

  const downloadZip = async () => {
    if (slides.length === 0) return;
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      let addedCount = 0;
      let allCaptions = "CAROUSEL CAPTIONS\n\n";
      
      // Process slides sequentially to avoid memory spikes or heavy canvas usage all at once
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        
        // Add to caption text file
        allCaptions += `SLIDE ${i + 1}\n`;
        allCaptions += `HEADLINE: ${slide.headline}\n`;
        if (slide.subtext) allCaptions += `SUBTEXT: ${slide.subtext}\n`;
        allCaptions += `CAPTION: ${slide.caption}\n\n`;

        try {
          if (slide.imageUrl) {
            // "Bake" the text onto the image
            const imageWithText = await addTextOverlay(slide.imageUrl, slide.headline, slide.subtext);
            
            const parts = imageWithText.split(',');
            if (parts.length === 2) {
              const base64Data = parts[1];
              zip.file(`slide-${i + 1}.png`, base64Data, { base64: true });
              addedCount++;
            }
          }
          // Also include video if present
          if (slide.videoUrl) {
              // videoUrl is a blob URL. We need to fetch the blob data.
              const response = await fetch(slide.videoUrl);
              const blob = await response.blob();
              zip.file(`slide-${i + 1}.mp4`, blob);
              addedCount++;
          }
        } catch (err) {
          console.error(`Error processing slide ${i + 1}`, err);
          // If overlay fails, fallback to original image
          if (slide.imageUrl) {
            const parts = slide.imageUrl.split(',');
            if (parts.length === 2) {
               zip.file(`slide-${i + 1}-raw.png`, parts[1], { base64: true });
               addedCount++;
            }
          }
        }
      }

      // Add the captions file
      zip.file("captions.txt", allCaptions);

      if (addedCount === 0) {
        alert("No valid images found to download.");
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = "powerful-carousel.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error creating ZIP:", error);
      alert("Failed to create ZIP file.");
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadPdf = async () => {
    if (slides.length === 0) return;
    setIsDownloading(true);
    try {
      // Calculate approximate dimensions based on aspect ratio
      // Base width 1080
      let pdfWidth = 1080;
      let pdfHeight = 1080; // default 1:1

      switch (aspectRatio) {
        case '3:4': pdfHeight = 1440; break;
        case '4:5': pdfHeight = 1350; break;
        case '4:3': pdfHeight = 810; break;
        case '9:16': pdfHeight = 1920; break;
        case '16:9': pdfHeight = 608; break;
        case '1:1': default: pdfHeight = 1080; break;
      }
      
      // We will make the PDF page taller to accommodate the caption below the image
      // Let's add 400px of space below for the caption text.
      const captionSpace = 400;
      const totalPageHeight = pdfHeight + captionSpace;

      const doc = new jsPDF({
        orientation: totalPageHeight > pdfWidth ? "portrait" : "landscape",
        unit: "px",
        format: [pdfWidth, totalPageHeight]
      });

      let pagesAdded = 0;

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (slide.imageUrl) {
          if (pagesAdded > 0) doc.addPage([pdfWidth, totalPageHeight]);
          
          try {
            // Draw Image
            doc.addImage(slide.imageUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            
            // --- DRAW SLIDE OVERLAY TEXT (Headline + Subtext) ---
            const margin = 60;
            const maxTextWidth = pdfWidth - (margin * 2);
            let currentTextY = pdfHeight * 0.75;
            
            // Headline
            if (slide.headline) {
              const fontSize = Math.min(60, pdfWidth * 0.055);
              doc.setFont("helvetica", "bold");
              doc.setFontSize(fontSize);
              const lines = doc.splitTextToSize(slide.headline, maxTextWidth);
              doc.setTextColor(0, 0, 0); // Shadow
              doc.text(lines, margin + 2, currentTextY + 2);
              doc.setTextColor(255, 255, 255); // Text
              doc.text(lines, margin, currentTextY);
              const lineHeight = fontSize * 1.15;
              currentTextY += (lines.length * lineHeight) + 20; 
            }
            
            // Subtext (Short) - REMOVED from overlay
            // if (slide.subtext) { ... }

            // --- DRAW CAPTION TEXT (Below Image) ---
            // Background for caption area
            doc.setFillColor(23, 23, 23); // Dark background like app
            doc.rect(0, pdfHeight, pdfWidth, captionSpace, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFont("times", "normal"); // Serif for readability
            doc.setFontSize(24);
            
            const captionMargin = 40;
            const captionMaxWidth = pdfWidth - (captionMargin * 2);
            let captionY = pdfHeight + 60;
            
            // Label
            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.setTextColor(234, 88, 12); // Orange
            doc.text("CAPTION CONTEXT", captionMargin, captionY);
            captionY += 30;

            // Content
            if (slide.caption || slide.subtext) {
               doc.setFont("times", "normal");
               doc.setFontSize(24);
               doc.setTextColor(226, 232, 240); // Slate 200
               
               let fullCaption = "";
               if (slide.subtext) fullCaption += slide.subtext + "\n\n";
               if (slide.caption) fullCaption += slide.caption;

               const captionLines = doc.splitTextToSize(fullCaption, captionMaxWidth);
               doc.text(captionLines, captionMargin, captionY);
            } else {
               doc.setFont("times", "italic");
               doc.setTextColor(100, 100, 100);
               doc.text("No caption provided.", captionMargin, captionY);
            }

            pagesAdded++;
          } catch (e) {
            console.error(`Failed to add slide ${i} to PDF`, e);
          }
        }
      }

      if (pagesAdded > 0) {
        doc.save("powerful-carousel.pdf");
      }
    } catch (error) {
      console.error("Error creating PDF:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const reset = () => {
    setSlides([]);
    setStatus({ step: 'idle' });
    setInputText('');
    setTopicInput('');
  };

  // --------------------------------------------------------------------------
  // MAIN APP
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-slate-300 relative overflow-x-hidden font-sans selection:bg-orange-500/30">
      
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
         {/* Rust Orange Glow */}
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-600/10 rounded-full blur-[120px]" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-orange-900/10 rounded-full blur-[100px]" />
         
         {/* Artsy Lines Pattern */}
         <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
            <defs>
               <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
               </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
         </svg>
      </div>

      {/* Header */}
      <header className="bg-neutral-900/80 backdrop-blur-md border-b border-orange-900/20 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-orange-600/10 p-2 rounded-lg border border-orange-500/20">
              <Sparkles className="w-5 h-5 text-orange-500" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">Powerful <span className="text-orange-500 font-normal">Carousel Generator</span></h1>
          </div>
          {status.step === 'complete' && (
             <button 
               onClick={reset}
               className="text-sm font-medium text-neutral-400 hover:text-white flex items-center space-x-1 transition-colors"
             >
               <RotateCcw className="w-4 h-4" />
               <span>New Project</span>
             </button>
          )}
        </div>
      </header>

      <main className="flex-grow flex flex-col max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative z-10">
        
        {/* Input Section */}
        {(status.step === 'idle' || status.step === 'parsing') && slides.length === 0 && (
          <div className="w-full max-w-3xl mx-auto space-y-8 animate-fade-in">
            
            {/* Intro Text */}
            <div className="text-center space-y-2 pt-8">
              <h2 className="text-4xl font-serif font-bold text-white tracking-tight">Create Visual Impact</h2>
              <p className="text-neutral-400">Generate professional carousels from a simple topic or script.</p>
            </div>

            {/* Magic Writer Section */}
            <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-1.5 flex items-center gap-2 shadow-xl shadow-black/50">
               <div className="bg-neutral-800 p-2.5 rounded-xl text-orange-500 shadow-inner">
                 <Lightbulb className="w-5 h-5" />
               </div>
               <input 
                 type="text" 
                 value={topicInput}
                 onChange={(e) => setTopicInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleGenerateScript()}
                 placeholder="Enter a topic (e.g., '7 Mental Models for Leaders')..."
                 className="flex-grow bg-transparent border-none focus:ring-0 text-white placeholder-neutral-500 text-sm py-2"
               />
               <button
                onClick={handleGenerateScript}
                disabled={isGeneratingScript || !topicInput.trim()}
                className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-orange-900/20"
               >
                 {isGeneratingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                 <span>Auto-Write</span>
               </button>
            </div>

            <div className="relative py-2">
               <div className="absolute inset-0 flex items-center" aria-hidden="true">
                 <div className="w-full border-t border-neutral-800"></div>
               </div>
               <div className="relative flex justify-center">
                 <span className="bg-neutral-950 px-3 text-xs text-neutral-500 font-medium uppercase tracking-widest">or refine your script</span>
               </div>
            </div>

            {/* Main Text Area */}
            <div className="bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-800 overflow-hidden ring-1 ring-white/5">
              <div className="bg-neutral-800/50 border-b border-neutral-800 flex justify-between items-center px-4 py-3">
                 <div className="flex items-center space-x-2">
                   <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                   <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Script Editor</span>
                 </div>
                 <div className="flex items-center space-x-4">
                   <button 
                    onClick={handleRefineText}
                    disabled={isRefining || !inputText.trim()}
                    className="text-xs flex items-center space-x-1.5 text-orange-400 hover:text-orange-300 transition-colors disabled:opacity-50"
                    title="Use AI to polish headlines and directives"
                   >
                     {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                     <span>Magic Polish</span>
                   </button>
                   <div className="h-4 w-px bg-neutral-700"></div>
                   <button 
                    onClick={handleCopySample}
                    className="text-xs flex items-center space-x-1.5 text-neutral-400 hover:text-white transition-colors"
                   >
                     {hasCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                     <span>Sample</span>
                   </button>
                 </div>
              </div>
              
              {/* Dark textarea with light gray text for readability */}
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste your slide descriptions here..."
                className="w-full h-72 p-6 bg-neutral-900 text-slate-300 placeholder-neutral-600 focus:outline-none resize-none font-mono text-sm leading-relaxed border-b border-neutral-800"
                style={{ caretColor: '#ea580c' }}
              />
              
              {/* Settings Bar */}
              <div className="bg-neutral-800/30 p-5 flex flex-col xl:flex-row gap-6 justify-between items-center">
                
                <div className="flex flex-wrap items-center gap-5 justify-center xl:justify-start">
                  
                  {/* Aspect Ratio Selector */}
                  <div className="group relative">
                     <div className="flex items-center space-x-2 mb-1.5">
                        <Settings2 className="w-3 h-3 text-orange-500" />
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Dimensions</span>
                     </div>
                     <select 
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                        className="bg-neutral-900 border border-neutral-700 text-slate-200 text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block w-32 p-2.5"
                      >
                        <option value="1:1">Square (1:1)</option>
                        <option value="4:5">Portrait (4:5)</option>
                        <option value="3:4">Portrait (3:4)</option>
                        <option value="4:3">Landscape (4:3)</option>
                        <option value="9:16">Vertical (9:16)</option>
                        <option value="16:9">Widescreen (16:9)</option>
                      </select>
                  </div>

                   {/* Style Selector */}
                   <div className="group relative">
                     <div className="flex items-center space-x-2 mb-1.5">
                        <PenTool className="w-3 h-3 text-orange-500" />
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Visual Style</span>
                     </div>
                     <select 
                      value={visualStyle}
                      onChange={(e) => setVisualStyle(e.target.value as VisualStyle)}
                      className="bg-neutral-900 border border-neutral-700 text-slate-200 text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block w-32 p-2.5"
                    >
                      <option value="cinematic">Cinematic</option>
                      <option value="minimalist">Minimalist</option>
                      <option value="cyberpunk">Cyberpunk</option>
                      <option value="corporate">Corporate 3D</option>
                      <option value="watercolor">Watercolor</option>
                      <option value="noir">Film Noir</option>
                      <option value="anime">Anime Style</option>
                    </select>
                   </div>
                   
                   {/* Text Density Selector */}
                   <div className="group relative">
                     <div className="flex items-center space-x-2 mb-1.5">
                        <AlignLeft className="w-3 h-3 text-orange-500" />
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Caption Detail</span>
                     </div>
                     <select 
                      value={textDensity}
                      onChange={(e) => setTextDensity(e.target.value as TextDensity)}
                      className="bg-neutral-900 border border-neutral-700 text-slate-200 text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block w-36 p-2.5"
                    >
                      <option value="brief">Brief</option>
                      <option value="standard">Standard</option>
                      <option value="detailed">Detailed</option>
                    </select>
                   </div>
                </div>

                <button
                  onClick={processSlides}
                  disabled={!inputText.trim() || status.step === 'parsing'}
                  className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-orange-600 hover:bg-orange-500 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                >
                  {status.step === 'parsing' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-white" />
                      <span>Generate Carousel</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress Indicator */}
        {status.step !== 'idle' && (
          <div className="w-full max-w-md mx-auto">
             <div className="flex justify-between text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                <span>{status.message}</span>
                {status.progress !== undefined && <span>{status.progress}%</span>}
             </div>
             {status.progress !== undefined && (
               <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                 <div 
                    className="bg-orange-500 h-1.5 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(234,88,12,0.5)]"
                    style={{ width: `${status.progress}%` }}
                 />
               </div>
             )}
          </div>
        )}

        {/* Results Area */}
        {slides.length > 0 && (
          <div className="space-y-6 animate-fade-in-up">
            
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-neutral-900 p-4 rounded-xl border border-neutral-800 shadow-xl">
              <h3 className="text-lg font-bold text-white flex items-center">
                Generated Slides 
                <span className="ml-3 bg-neutral-800 text-orange-500 text-xs py-1 px-2.5 rounded-full border border-neutral-700">{slides.length}</span>
              </h3>

              <div className="flex items-center space-x-3">
                 <button
                    onClick={generateAllVideos}
                    disabled={status.step === 'generating_videos'}
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium bg-neutral-800 text-neutral-300 hover:bg-orange-600 hover:text-white rounded-lg border border-neutral-700 hover:border-orange-500 transition-colors disabled:opacity-50 mr-2"
                  >
                  {status.step === 'generating_videos' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                  <span>Generate All Videos</span>
                </button>

                <div className="flex bg-neutral-800 p-1 rounded-lg border border-neutral-700">
                  <button
                    onClick={() => setViewMode('carousel')}
                    className={`p-2 rounded-md transition-all ${viewMode === 'carousel' ? 'bg-orange-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'}`}
                    title="Carousel View"
                  >
                    <Columns className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-orange-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'}`}
                    title="Grid View"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </div>

                <div className="h-6 w-px bg-neutral-800 mx-2" />

                <button
                  onClick={downloadZip}
                  disabled={isDownloading}
                  className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors disabled:opacity-50"
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4 text-orange-500" />}
                  <span>ZIP</span>
                </button>
                <button
                  onClick={downloadPdf}
                  disabled={isDownloading}
                  className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors disabled:opacity-50"
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-orange-500" />}
                  <span>PDF</span>
                </button>
              </div>
            </div>
            
            {/* Slides Display */}
            <div className={`
              ${viewMode === 'carousel' 
                ? 'flex overflow-x-auto pb-12 pt-4 space-x-8 px-4 no-scrollbar snap-x items-center min-h-[450px]' 
                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 px-4 pb-20'
              }
            `}>
              {slides.map((slide, index) => (
                <div key={slide.id} className={viewMode === 'carousel' ? 'snap-center' : 'w-full flex justify-center'}>
                  <SlideCard 
                    slide={slide} 
                    index={index} 
                    onRegenerate={regenerateSlide}
                    onEdit={openEditModal}
                    onGenerateVideo={handleGenerateVideo}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editingSlideId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-neutral-800">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-orange-500" />
                Edit Visual
              </h3>
              <button 
                onClick={() => setEditingSlideId(null)}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-neutral-800">
                {/* Preview of current image being edited */}
                <img 
                  src={slides.find(s => s.id === editingSlideId)?.imageUrl} 
                  alt="Preview" 
                  className="w-full h-full object-cover"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-400">What would you like to change?</label>
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="e.g., 'Add a retro filter', 'Make it look like a painting', 'Remove the person in the background'"
                  className="w-full h-24 p-4 bg-neutral-950 border border-neutral-800 rounded-xl focus:ring-1 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-neutral-600 resize-none text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-4 bg-neutral-800/50 border-t border-neutral-800 flex justify-end gap-3">
              <button
                onClick={() => setEditingSlideId(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={!editPrompt.trim() || isApplyingEdit}
                className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-orange-900/20 transition-all disabled:opacity-50"
              >
                {isApplyingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Applying...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Apply Edit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-8 mt-auto relative z-10">
        <div className="max-w-7xl mx-auto px-4 text-center text-neutral-600 text-xs">
          <p>Powerful Carousel Generator &copy; 2025. Powered by Gemini 3 Pro Vision.</p>
        </div>
      </footer>
    </div>
  );
};

// Helper loader component
const Loader2 = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export default App;
