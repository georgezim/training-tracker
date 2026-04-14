'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface Props {
  imageFile: File;
  onConfirm: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

export default function AvatarCropModal({ imageFile, onConfirm, onCancel }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSrc, setImgSrc] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    // Auto-fit: scale to fill the 240px circle
    const fit = 240 / Math.min(img.naturalWidth, img.naturalHeight);
    setScale(Math.max(1, fit));
  }

  function handleMouseDown(e: React.MouseEvent) {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }
  function handleMouseUp() { setDragging(false); }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      setDragging(true);
      setDragStart({ x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y });
    }
  }
  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && dragging) {
      setOffset({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
    }
    if (e.touches.length === 2) {
      // Pinch zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setScale(prev => Math.max(0.5, Math.min(4, prev * (dist / 200))));
    }
  }
  function handleTouchEnd() { setDragging(false); }

  async function handleConfirm() {
    const canvas = document.createElement('canvas');
    const SIZE = 400;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx || !imgRef.current) return;

    // Circle clip
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw the image with current transform
    const displaySize = 240;
    const scaleX = (imgSize.w * scale) / displaySize;
    const scaleY = (imgSize.h * scale) / displaySize;
    const sx = (-offset.x / displaySize) * imgSize.w * scale + imgSize.w * scale / 2 - imgSize.w / 2 / scaleX * SIZE / displaySize;

    // Simpler: draw to canvas using the visible portion
    const visibleW = displaySize / scale;
    const visibleH = displaySize / scale;
    const srcX = (imgSize.w - visibleW) / 2 - offset.x / scale;
    const srcY = (imgSize.h - visibleH) / 2 - offset.y / scale;

    ctx.drawImage(
      imgRef.current,
      srcX, srcY, visibleW, visibleH,
      0, 0, SIZE, SIZE
    );

    canvas.toBlob(blob => {
      if (blob) onConfirm(blob);
    }, 'image/jpeg', 0.9);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 rounded-3xl p-5 w-full max-w-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-lg">Adjust photo</h3>
            <button onClick={onCancel} className="text-gray-500 text-2xl leading-none">×</button>
          </div>
          <p className="text-gray-500 text-xs">Drag to reposition · pinch to zoom</p>

          {/* Crop circle preview */}
          <div className="flex justify-center">
            <div
              ref={containerRef}
              className="relative overflow-hidden rounded-full bg-gray-800 cursor-grab active:cursor-grabbing"
              style={{ width: 240, height: 240 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {imgSrc && (
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="crop preview"
                  onLoad={onImgLoad}
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                    transformOrigin: 'center',
                    maxWidth: 'none',
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {/* Circle border overlay */}
              <div className="absolute inset-0 rounded-full ring-2 ring-blue-500 pointer-events-none" />
            </div>
          </div>

          {/* Zoom slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Zoom</span>
              <span>{scale.toFixed(1)}×</span>
            </div>
            <input
              type="range" min={0.5} max={4} step={0.05} value={scale}
              onChange={e => setScale(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-sm">
              Cancel
            </button>
            <button onClick={handleConfirm} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm">
              Save photo
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
