'use client'
import { useState } from 'react';
import OCRUpload from '../components/ocr';
import { OCRResult } from '../types/ocr';

export default function Home() {
  const [lastResult, setLastResult] = useState<OCRResult | null>(null);

  const handleProcessingStart = () => {
    console.log('OCR processing started...');
  };

  const handleProcessingEnd = (result: OCRResult | null) => {
    console.log('OCR processing completed:', result);
    setLastResult(result);
  };

  return (
    <div className="">
   
        
        <OCRUpload 
        />

       
    </div>
  );
}