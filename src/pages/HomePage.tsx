import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { ChevronRight, Columns2, Columns3, Download, Grid2X2, Grid3X3, Maximize, Move, Rows2, Rows3, Trash2, Upload } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type CropMode = '3x3' | '3x2' | '2x2';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const HomePage: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageURL, setImageURL] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [cropMode, setCropMode] = useState<CropMode>('3x3');
  const [cropRect, setCropRect] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cropRectRef = useRef<Rect>(cropRect);
  const pendingAnimationFrame = useRef<number | null>(null);

  useEffect(() => {
    cropRectRef.current = cropRect;
  }, [cropRect]);

  useEffect(() => {
    return () => {
      if (imageURL) {
        URL.revokeObjectURL(imageURL);
      }
      if (pendingAnimationFrame.current !== null) {
        window.cancelAnimationFrame(pendingAnimationFrame.current);
      }
    };
  }, [imageURL]);

  // 初始化裁剪框
  const calculateInitialRect = useCallback((imgWidth: number, imgHeight: number, mode: CropMode, currentRect?: Rect) => {
    const ratio = mode === '3x2' ? 3 / 2 : 1;
    let width, height;

    if (imgWidth / imgHeight > ratio) {
      height = imgHeight * 0.8;
      width = height * ratio;
    } else {
      width = imgWidth * 0.8;
      height = width / ratio;
    }

    if (currentRect && currentRect.width > 0) {
      const centerX = currentRect.x + currentRect.width / 2;
      const centerY = currentRect.y + currentRect.height / 2;
      
      let x = centerX - width / 2;
      let y = centerY - height / 2;

      // 调整以确保不超出边界
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      if (x + width > imgWidth) x = imgWidth - width;
      if (y + height > imgHeight) y = imgHeight - height;
      
      return { x, y, width, height };
    }

    return {
      x: (imgWidth - width) / 2,
      y: (imgHeight - height) / 2,
      width,
      height,
    };
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | undefined;
    if ('files' in e.target && e.target.files) {
      file = e.target.files[0];
    } else if ('dataTransfer' in e && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    }

    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast.error('请上传 JPG、PNG 或 WebP 格式的图片');
        return;
      }

      // if (file.size > 50 * 1024 * 1024) {
      //   toast.error('请上传小于 50MB 的图片');
      //   return;
      // }

      if (imageURL) {
        URL.revokeObjectURL(imageURL);
      }

      const newUrl = URL.createObjectURL(file);
      setImageFile(file);
      setImageURL(newUrl);

      try {
        const bitmap = await createImageBitmap(file);
        setImageSize({ width: bitmap.width, height: bitmap.height });
        setCropRect(calculateInitialRect(bitmap.width, bitmap.height, cropMode));
        bitmap.close();
      } catch (error) {
        console.error(error);
        toast.error('图片解码失败，请更换图片再试');
        URL.revokeObjectURL(newUrl);
        setImageFile(null);
        setImageURL(null);
      }
    }
  };

  const handleModeChange = (mode: CropMode) => {
    setCropMode(mode);
    if (imageSize.width > 0) {
      setCropRect(calculateInitialRect(imageSize.width, imageSize.height, mode, cropRect));
    }
  };

  // 拖动和缩放逻辑（节流 setState）
  const handleInteraction = (e: React.MouseEvent | React.TouchEvent, type: 'move' | 'resize') => {
    if (!imageRef.current) return;

    e.preventDefault();
    const isTouch = 'touches' in e;
    const startX = isTouch ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const startY = isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const initialRect = { ...cropRectRef.current };
    const rect = imageRef.current.getBoundingClientRect();
    const scale = imageSize.width / rect.width;

    const scheduleUpdate = (nextRect: Rect) => {
      cropRectRef.current = nextRect;
      if (pendingAnimationFrame.current === null) {
        pendingAnimationFrame.current = window.requestAnimationFrame(() => {
          setCropRect(cropRectRef.current);
          pendingAnimationFrame.current = null;
        });
      }
    };

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const mX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const mY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const deltaX = (mX - startX) * scale;
      const deltaY = (mY - startY) * scale;

      let nextRect = { ...initialRect };

      if (type === 'move') {
        let newX = initialRect.x + deltaX;
        let newY = initialRect.y + deltaY;

        newX = Math.max(0, Math.min(newX, imageSize.width - initialRect.width));
        newY = Math.max(0, Math.min(newY, imageSize.height - initialRect.height));

        nextRect.x = newX;
        nextRect.y = newY;
      } else {
        const ratio = cropMode === '3x2' ? 3 / 2 : 1;
        let newWidth = initialRect.width + deltaX;

        if (newWidth < 100) newWidth = 100;

        let newHeight = newWidth / ratio;

        if (initialRect.x + newWidth > imageSize.width) {
          newWidth = imageSize.width - initialRect.x;
          newHeight = newWidth / ratio;
        }
        if (initialRect.y + newHeight > imageSize.height) {
          newHeight = imageSize.height - initialRect.y;
          newWidth = newHeight * ratio;
        }

        nextRect.width = newWidth;
        nextRect.height = newHeight;
      }

      scheduleUpdate(nextRect);
    };

    const onEnd = () => {
      if (pendingAnimationFrame.current !== null) {
        window.cancelAnimationFrame(pendingAnimationFrame.current);
        pendingAnimationFrame.current = null;
      }
      setCropRect(cropRectRef.current);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const clearImage = useCallback(() => {
    if (imageURL) {
      URL.revokeObjectURL(imageURL);
    }
    setImageFile(null);
    setImageURL(null);
    setImageSize({ width: 0, height: 0 });
    setCropRect({ x: 0, y: 0, width: 0, height: 0 });
  }, [imageURL]);

  // 生成并下载
  const handleDownload = async () => {
    if (!imageURL || !imageSize.width) {
      toast.error('请先上传一张图片');
      return;
    }

    setIsProcessing(true);
    try {
      const zip = new JSZip();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      const cols = cropMode === '3x3' ? 3 : cropMode === '3x2' ? 3 : 2;
      const rows = cropMode === '3x3' ? 3 : 2;
      const pieceWidth = Math.max(1, cropRect.width / cols);
      const pieceHeight = Math.max(1, cropRect.height / rows);

      canvas.width = pieceWidth;
      canvas.height = pieceHeight;

      // 通过 createImageBitmap 只解码一次
      const bitmapSource = imageRef.current
        ? await createImageBitmap(imageRef.current)
        : imageFile
        ? await createImageBitmap(imageFile)
        : null;

      if (!bitmapSource) {
        throw new Error('图片资源不可用');
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.clearRect(0, 0, pieceWidth, pieceHeight);
          ctx.drawImage(
            bitmapSource,
            cropRect.x + c * pieceWidth,
            cropRect.y + r * pieceHeight,
            pieceWidth,
            pieceHeight,
            0,
            0,
            pieceWidth,
            pieceHeight
          );

          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.9));
          if (blob) {
            zip.file(`subimg_${r + 1}_${c + 1}.png`, blob);
          }

          // 让 UI 有机会更新，避免长时间卡顿
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      bitmapSource.close();
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `切图助手_${Date.now()}.zip`);
      toast.success('导出成功，请查看下载列表');
    } catch (error) {
      console.error(error);
      toast.error('生成失败，请稍后重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const colCount = cropMode === '3x3' ? 3 : cropMode === '3x2' ? 3 : 2;
  const rowCount = cropMode === '3x3' ? 3 : 2;
  const previewCount = colCount * rowCount;

  return (
    <div className="min-h-screen bg-[#FBFBFD] text-[#1D1D1F] selection:bg-blue-100 flex flex-col items-center">
      {/* 顶部导航 */}
      <nav className="w-full h-14 border-b border-black/[0.05] bg-white/80 backdrop-blur-xl sticky top-0 z-50 flex items-center justify-center">
        <div className="w-full max-w-6xl px-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Grid3X3 className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold tracking-tight text-lg">切图助手</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-black/60">
              <a href="https://space.bilibili.com/507925563" target="_blank" rel="noreferrer" className="hover:text-black">B站@Kira雨辰</a>
              <span className="text-black/30">·</span>
              <a href="https://github.com/Takeoff0518/grid-splitter-react" target="_blank" rel="noreferrer" className="hover:text-black">GitHub</a>
            </div>
          </div>
        </div>
      </nav>

      <main className="w-full max-w-6xl px-6 py-12 flex flex-col md:flex-row gap-12">
        {/* 左侧：编辑区 */}
        <div className="flex-1 space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">编辑图片</h2>
            <p className="text-black/50">上传一张图片，调整裁剪区域，准备分割。</p>
          </div>

          {!imageURL ? (
            <div 
              className="aspect-video w-full border-2 border-dashed border-black/10 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white hover:bg-black/[0.01] hover:border-black/20 transition-all cursor-pointer group"
              onClick={() => document.getElementById('file-upload')?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleImageUpload(e);
              }}
            >
              <div className="w-16 h-16 bg-black/5 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-black/40" />
              </div>
              <div className="text-center">
                <p className="font-semibold">点击或拖拽图片上传</p>
                <p className="text-sm text-black/40 mt-1">支持 PNG, JPG, WebP 格式</p>
              </div>
              <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            </div>
          ) : (
            <div className="space-y-6">
              <Card className="border-none shadow-[0_20px_50px_rgba(0,0,0,0.08)] rounded-3xl overflow-hidden bg-white">
                <CardContent className="p-0 relative flex items-center justify-center min-h-[400px] bg-neutral-50" ref={containerRef}>
                  <div className="relative inline-block m-8">
                    <img
                      ref={imageRef}
                      src={imageURL ?? undefined}
                      alt="Source"
                      className="max-w-full max-h-[60vh] block object-contain select-none shadow-sm"
                    />
                    
                    {/* 交互裁剪框 */}
                    <div
                      className="absolute border-2 border-white shadow-[0_0_0_2000px_rgba(0,0,0,0.4)] cursor-move touch-none overflow-hidden group"
                      style={{
                        left: `${(cropRect.x / imageSize.width) * 100}%`,
                        top: `${(cropRect.y / imageSize.height) * 100}%`,
                        width: `${(cropRect.width / imageSize.width) * 100}%`,
                        height: `${(cropRect.height / imageSize.height) * 100}%`,
                      }}
                      onMouseDown={(e) => handleInteraction(e, 'move')}
                      onTouchStart={(e) => handleInteraction(e, 'move')}
                    >
                      {/* 辅助线 */}
                      <div className={`absolute inset-0 grid ${rowCount === 3 ? 'grid-rows-3' : 'grid-rows-2'} ${colCount === 3 ? 'grid-cols-3' : 'grid-cols-2'} pointer-events-none opacity-40`}>
                        {Array.from({ length: rowCount * colCount }).map((_, idx) => {
                          const row = Math.floor(idx / colCount);
                          const col = idx % colCount;
                          const isLastRow = row === rowCount - 1;
                          const isLastCol = col === colCount - 1;
                          return (
                            <div
                              key={idx}
                              className={`${isLastRow ? '' : 'border-b-2'} ${isLastCol ? '' : 'border-r-2'} border-white`}
                            />
                          );
                        })}
                      </div>

                      {/* 缩放手柄 */}
                      <div 
                        className="absolute bottom-0 right-0 w-8 h-8 bg-white shadow-lg flex items-center justify-center cursor-nwse-resize hover:scale-110 active:scale-95 transition-all"
                        onMouseDown={(e) => { e.stopPropagation(); handleInteraction(e, 'resize'); }}
                        onTouchStart={(e) => { e.stopPropagation(); handleInteraction(e, 'resize'); }}
                      >
                        <Maximize className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-6 bg-white rounded-3xl shadow-sm border border-black/[0.03]">
                <div className="flex items-center gap-2">
                  <div className="flex p-1 bg-neutral-100 rounded-2xl">
                    <Button 
                      variant={cropMode === '3x3' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => handleModeChange('3x3')}
                      className="rounded-xl px-4 h-9"
                    >
                      <Grid3X3 className="w-4 h-4 mr-2" />
                      3×3
                    </Button>
                    <Button 
                      variant={cropMode === '3x2' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => handleModeChange('3x2')}
                      className="rounded-xl px-4 h-9"
                    >
                      <Rows2 className="w-4 h-4 mr-2" />
                      3×2
                    </Button>
                    <Button 
                      variant={cropMode === '2x2' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => handleModeChange('2x2')}
                      className="rounded-xl px-4 h-9"
                    >
                      <Grid2X2 className="w-4 h-4 mr-2" />
                      2×2
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-black/40 flex items-center gap-2 font-medium">
                  <Move className="w-4 h-4" />
                  拖动裁剪框定位，拉动手柄调整大小
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：预览与导出 */}
        <div className="w-full md:w-[380px] shrink-0 space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">预览</h2>
            <p className="text-black/50">查看分割后的实际效果。</p>
          </div>

          <Card className="border-none shadow-[0_20px_50px_rgba(0,0,0,0.08)] rounded-3xl overflow-hidden bg-white p-6">
            <div className="space-y-8">
              <div 
                className={cn(
                  "grid gap-0.5 bg-neutral-100 p-0.5 overflow-hidden",
                  cropMode === '3x3' || cropMode === '2x2' ? "aspect-square" : "aspect-[3/2]",
                  cropMode === '3x3' ? "grid-cols-3" : cropMode === '3x2' ? "grid-cols-3" : "grid-cols-2"
                )}
              >
                {Array.from({ length: previewCount }).map((_, i) => {
                  const col = i % colCount;
                  const row = Math.floor(i / colCount);
                  const pieceWidth = cropRect.width / colCount;
                  const pieceHeight = cropRect.height / rowCount;
                  
                  // 计算背景位置百分比
                  // background-position: (x / (total - viewport)) * 100%
                  const bx = imageSize.width > pieceWidth ? ( (cropRect.x + col * pieceWidth) / (imageSize.width - pieceWidth) ) * 100 : 0;
                  const by = imageSize.height > pieceHeight ? ( (cropRect.y + row * pieceHeight) / (imageSize.height - pieceHeight) ) * 100 : 0;
                  const bWidth = (imageSize.width / pieceWidth) * 100;
                  const bHeight = (imageSize.height / pieceHeight) * 100;

                  return (
                    <div key={i} className="bg-neutral-50 overflow-hidden relative aspect-square">
                      {imageURL && (
                        <div
                          className="absolute inset-0 bg-no-repeat"
                          style={{
                            backgroundImage: imageURL ? `url(${imageURL})` : undefined,
                            backgroundSize: `${bWidth}% ${bHeight}%`,
                            backgroundPosition: `${bx}% ${by}%`,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4">
                <Button 
                  className="w-full h-14 rounded-2xl text-lg font-bold bg-black hover:bg-black/90 text-white shadow-xl shadow-black/10 transition-all active:scale-[0.98] disabled:bg-black/20"
                  disabled={!imageURL || isProcessing}
                  onClick={handleDownload}
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      准备切片中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Download className="w-5 h-5" />
                      导出并打包 ZIP
                    </span>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={clearImage}
                  disabled={!imageURL || isProcessing}
                  className="w-full h-14 rounded-2xl text-lg font-bold bg-white border-2 border-red-500 text-red-500 shadow-xl shadow-black/10 transition-all active:scale-[0.98] disabled:bg-black/5 hover:bg-red-50"
                  >
                  <span className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5" /> 清除已上传的图片
                  </span>
                </Button>
                
                <div className="p-4 bg-neutral-50 rounded-2xl border border-black/[0.03]">
                   <p className="text-xs text-black/40 leading-relaxed">
                     点击按钮将自动按选定比例切割，并生成 ZIP 压缩包下载。文件名将按行列自动命名。
                   </p>
                </div>
              </div>
            </div>
          </Card>

          {/* 步骤提示 */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm uppercase tracking-widest text-black/30 px-2">操作步骤</h4>
            <div className="space-y-2">
              {[
                "上传你需要切割的图片",
                "选择裁剪模式",
                "在左侧预览中调整裁剪区域",
                "点击导出按钮获取所有子图"
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-black/[0.03] shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-neutral-100 text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium text-black/70">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* 底部页脚 */}
      <footer className="w-full border-t border-black/[0.05] bg-white/80 backdrop-blur-xl py-8 mt-auto">
        <div className="w-full max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <img
              src="https://hitscounter.dev/api/hit?url=grid-splitter.tbpdt.top&label=&icon=eye&color=%23198754&message=&style=flat&tz=Asia%2FShanghai"
              alt="访问计数"
              className="h-6"
            />
          </div>
        </div>
      </footer>
    </div>
  );
};
