// types/ocr.ts
export interface ExtractedData {
  name: string;
  address: string;
  phoneNumber: string;
}

export interface OCRResult {
  extractedData: ExtractedData;
  rawText: string;
  confidence: number;
}

export interface ImageUploadProps {
  onProcessingStart?: () => void;
  onProcessingEnd?: (result: OCRResult | null) => void;
}