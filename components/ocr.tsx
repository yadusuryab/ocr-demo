'use client'
import { useState, useRef, ChangeEvent } from 'react';
import { createWorker } from 'tesseract.js';
import { OCRResult, ImageUploadProps, ExtractedData } from '../types/ocr';

const OCRUpload: React.FC<ImageUploadProps> = ({ 
  onProcessingStart, 
  onProcessingEnd 
}) => {
  const [image, setImage] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData>({
    name: '',
    address: '',
    phoneNumber: ''
  });
  const [rawText, setRawText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB');
      return;
    }

    setError('');
    setImage(URL.createObjectURL(file));
    setExtractedData({ name: '', address: '', phoneNumber: '' });
    setRawText('');
  };

  const extractAllData = (text: string): ExtractedData => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const extracted: ExtractedData = {
      name: '',
      address: '',
      phoneNumber: ''
    };

    // Phone number extraction
    const exactMatch = text.match(/\b\d{10}\b/);
    if (exactMatch) {
      extracted.phoneNumber = exactMatch[0];
    } else {
      const potentialNumbers = lines.filter(line => {
        const digitsOnly = line.replace(/\D/g, '');
        return digitsOnly.length === 10;
      });

      if (potentialNumbers.length > 0) {
        extracted.phoneNumber = potentialNumbers[0].replace(/\D/g, '').substring(0, 10);
      } else {
        const allDigits = text.replace(/\D/g, '');
        if (allDigits.length >= 10) {
          for (let i = 0; i <= allDigits.length - 10; i++) {
            const sequence = allDigits.substring(i, i + 10);
            if (/^\d{10}$/.test(sequence)) {
              extracted.phoneNumber = sequence;
              break;
            }
          }
        }
      }
    }

    // Name extraction
    const nameCandidates = lines.filter(line => {
      if (line.includes('@') || line.match(/\d{10}/) || line.match(/\d{3}[-\.\s]??\d{3}[-\.\s]??\d{4}/)) {
        return false;
      }
      
      const words = line.split(/\s+/);
      if (words.length >= 2 && words.length <= 4) {
        const hasTitleCase = words.every(word => 
          word.length > 1 && 
          word[0] === word[0].toUpperCase() && 
          word.slice(1) === word.slice(1).toLowerCase()
        );
        
        const hasCommonNameWords = words.some(word => 
          ['mr', 'mrs', 'ms', 'dr', 'prof'].includes(word.toLowerCase().replace(/[.,]/g, ''))
        );
        
        return hasTitleCase || hasCommonNameWords;
      }
      return false;
    });

    if (nameCandidates.length > 0) {
      extracted.name = nameCandidates[0];
    } else {
      const firstCleanLine = lines.find(line => !line.match(/\d/) && line.length > 3);
      if (firstCleanLine) {
        extracted.name = firstCleanLine;
      }
    }

    // Address extraction
    const addressIndicators = [
      'street', 'st', 'avenue', 'ave', 'road', 'rd', 'lane', 'ln', 
      'drive', 'dr', 'boulevard', 'blvd', 'court', 'ct', 'plaza', 'plz'
    ];
    
    const addressCandidates = lines.filter(line => {
      const lowerLine = line.toLowerCase();
      const hasAddressWord = addressIndicators.some(indicator => 
        lowerLine.includes(indicator)
      );
      const hasAddressPattern = line.match(/\d+\s+[A-Za-z]/);
      const hasCityStateZip = line.match(/[A-Za-z]+,\s*[A-Z]{2}\s*\d{5}/);
      
      return hasAddressWord || hasAddressPattern || hasCityStateZip;
    });

    if (addressCandidates.length > 0) {
      extracted.address = addressCandidates[0];
      const addressIndex = lines.indexOf(addressCandidates[0]);
      if (addressIndex < lines.length - 1) {
        const nextLine = lines[addressIndex + 1];
        if (nextLine.match(/[A-Za-z]+,\s*[A-Z]{2}\s*\d{5}/) || nextLine.match(/\d{5}/)) {
          extracted.address += ', ' + nextLine;
        }
      }
    } else {
      const potentialAddress = lines.find(line => {
        const hasNumbers = line.match(/\d+/);
        const notPhone = !line.match(/\d{10}/) && !line.match(/\d{3}[-\.\s]??\d{3}[-\.\s]??\d{4}/);
        return hasNumbers && notPhone && line.length > 10;
      });
      
      if (potentialAddress) {
        extracted.address = potentialAddress;
      }
    }

    return extracted;
  };

  const processImage = async (): Promise<void> => {
    if (!image) {
      setError('Please upload an image first');
      return;
    }

    setLoading(true);
    setError('');
    setExtractedData({ name: '', address: '', phoneNumber: '' });
    setRawText('');
    onProcessingStart?.();

    try {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_ocr_engine_mode: '1',
      });

      const { data } = await worker.recognize(image);
      await worker.terminate();

      const extractedText = data.text;
      setRawText(extractedText);

      const extracted = extractAllData(extractedText);
      setExtractedData(extracted);

      const result: OCRResult = {
        extractedData: extracted,
        rawText: extractedText,
        confidence: data.confidence
      };

      const hasData = Object.values(extracted).some(value => value.trim().length > 0);
      if (!hasData) {
        setError('No recognizable data found. Try a clearer image.');
      }

      onProcessingEnd?.(result);

    } catch (err) {
      console.error('OCR Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error processing image';
      setError(`Processing Error: ${errorMessage}`);
      onProcessingEnd?.(null);
    } finally {
      setLoading(false);
    }
  };

  const resetUpload = (): void => {
    setImage(null);
    setExtractedData({ name: '', address: '', phoneNumber: '' });
    setRawText('');
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen  bg-blue-900  py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-6">
            <h1 className="text-xl italic">
              traft.
            </h1>
          </div>
         
        </div>

        {/* Main Card */}
        <div className="bg-slate-800/40 backdrop-blur-lg rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden">
          <div className="p-8">
            {/* Upload Area */}
            <div className="mb-8">
              <div 
                className={`border-3 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer
                  ${image ? 'border-cyan-400/50 bg-cyan-400/5' : 'border-slate-600/50 hover:border-cyan-400/30 hover:bg-slate-700/30'}
                  ${loading && 'opacity-50 cursor-not-allowed'}`}
                onClick={() => !loading && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={loading}
                />
                
                {!image ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-r from-cyan-400 to-blue-500 rounded-2xl flex items-center justify-center">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-semibold text-lg mb-2">Drop your document here</p>
                      <p className="text-slate-400 text-sm">Supports JPEG, PNG, WebP • Max 5MB</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-20 h-20 mx-auto rounded-xl overflow-hidden border-2 border-cyan-400/20">
                      <img 
                        src={image} 
                        alt="Uploaded preview" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-cyan-200 font-medium">Document ready for processing</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mb-8">
              <button
                onClick={processImage}
                disabled={loading || !image}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span className="animate-pulse">Processing...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-3">
                   
                    Extract Information
                  </span>
                )}
              </button>
              
              {image && (
                <button
                  onClick={resetUpload}
                  disabled={loading}
                  className="px-6 py-4 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-400/30 rounded-xl">
                <div className="flex items-center gap-3 text-red-300">
                  <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Results */}
           
            {/* Raw Text Preview */}
            {rawText && (
              <div className="bg-slate-800/40 rounded-2xl border border-slate-700/30 p-6">
                <h4 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-3">
                  <div className="w-1.5 h-4 bg-slate-400 rounded-full"></div>
                  Raw Text
                </h4>
                <pre className="text-sm text-slate-400 whitespace-pre-wrap bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 font-mono">
                  {rawText}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
       
      </div>
    </div>
  );
};

export default OCRUpload;