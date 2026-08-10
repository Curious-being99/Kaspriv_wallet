import React, { useState } from 'react';

interface KaspaLogoProps {
  className?: string;
  sizeClassName?: string; // e.g. "w-10 h-10" or "w-7 h-7"
}

export const KaspaLogo: React.FC<KaspaLogoProps> = ({ className = '', sizeClassName = 'w-10 h-10' }) => {
  const [srcIndex, setSrcIndex] = useState(0);

  // Fallback URLs
  const sources = [
    '/asset_logo.png',
    '/assets/kaspa-transaction-icon.png',
    '/assets/kaspa-logo.svg',
    '/assets/kas_icon.svg',
    '/assets/kas_icon.png',
  ];

  const handleLoadError = () => {
    if (srcIndex < sources.length - 1) {
      setSrcIndex(srcIndex + 1);
    } else {
      // Set to -1 to trigger the inline SVG fallback
      setSrcIndex(-1);
    }
  };

  // If all image files failed or are slow, render a pristine inline SVG with exact Kaspa branding colors and look
  if (srcIndex === -1) {
    return (
      <div className={`${sizeClassName} rounded-full flex items-center justify-center overflow-hidden shadow-sm shrink-0 bg-[#090D12] border border-[#212B38] ${className}`}>
        <svg className="w-3/5 h-3/5 text-[#70C7BA]" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M120 100H200L320 256L200 412H120L240 256L120 100Z" fill="currentColor" />
          <path d="M260 100H340L460 256L340 412H260L380 256L260 100Z" fill="currentColor" fillOpacity="0.6" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`${sizeClassName} rounded-full flex items-center justify-center overflow-hidden shadow-sm shrink-0 bg-[#090D12] border border-[#212B38] ${className}`}>
      <img
        src={sources[srcIndex]}
        alt="Kaspa Logo"
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover"
        onError={handleLoadError}
      />
    </div>
  );
};
