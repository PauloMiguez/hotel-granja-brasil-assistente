import React, { useEffect, useRef } from 'react';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoSrc: string;
}

export const VideoModal: React.FC<VideoModalProps> = ({ isOpen, onClose, videoSrc }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.play().catch(() => {});
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="relative w-full h-full max-w-7xl" onClick={(e) => e.stopPropagation()}>
        <button
          className="absolute top-4 right-4 text-white text-4xl z-10 hover:text-gray-300"
          onClick={onClose}
        >
          &times;
        </button>
        <div className="flex items-center justify-center h-full p-4">
          <video
            ref={videoRef}
            controls
            playsInline
            className="max-w-full max-h-full object-contain"
          >
            <source src={videoSrc} type="video/mp4" />
            Seu navegador não suporta a tag de vídeo.
          </video>
        </div>
      </div>
    </div>
  );
};
