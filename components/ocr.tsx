'use client'
import { useState, useRef, ChangeEvent, useEffect } from 'react';

interface StoredImage {
  id: string;
  imageUrl: string;
  text: string;
  name: string;
  address: string;
  phoneNumber: string;
  timestamp: number;
}

const OCRUpload: React.FC = () => {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<boolean>(true);
  const [processing, setProcessing] = useState<boolean>(false);
  const [processingFile, setProcessingFile] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load images from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('ocrImages');
    if (stored) {
      setImages(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ocrImages', JSON.stringify(images));
  }, [images]);

  // Convert image file to base64
  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Google Cloud Vision OCR
  const googleVisionOCR = async (file: File): Promise<string> => {
    try {
      const base64 = await convertToBase64(file);
      // Remove the data:image/...;base64, prefix
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');

      // Replace with your actual Google Cloud Vision API key
      const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_VISION_API_KEY || 'YOUR_API_KEY_HERE';
      
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                image: {
                  content: base64Data,
                },
                features: [
                  {
                    type: 'TEXT_DETECTION',
                    maxResults: 1,
                  },
                ],
                imageContext: {
                  languageHints: ['en'],
                },
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Google Vision API error');
      }

      const data = await response.json();
      const text = data.responses[0]?.fullTextAnnotation?.text || '';
      
      return text;
    } catch (error) {
      console.error('Google Vision OCR Error:', error);
      throw error;
    }
  };

  const extractStructuredData = (text: string) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let name = '';
    let address = '';
    let phoneNumber = '';

    // Enhanced phone number extraction
    const phoneRegexes = [
      /(\+?1?[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g, // US format
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // Standard format
      /\b\d{10}\b/g, // Plain 10 digits
      /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g // International
    ];

    for (const regex of phoneRegexes) {
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        phoneNumber = matches[0];
        break;
      }
    }

    // Name extraction - look for proper noun patterns
    const nameCandidates = lines.filter(line => {
      // Skip lines with numbers, special characters (except spaces and commas)
      if (line.match(/\d/) || 
          line.match(/[@#$%^&*+=<>[\]{}|\\]/) || 
          line.length > 50 || 
          line.length < 2) {
        return false;
      }
      
      const words = line.split(/\s+/);
      // Names typically have 2-4 words
      if (words.length >= 2 && words.length <= 4) {
        // Check if most words start with capital letters
        const capitalWords = words.filter(word => 
          word.length > 0 && word[0] === word[0].toUpperCase()
        );
        return capitalWords.length >= words.length - 1; // Allow one non-capital word
      }
      return false;
    });

    if (nameCandidates.length > 0) {
      name = nameCandidates[0];
    }

    // Address extraction with better patterns
    const addressIndicators = [
      'street', 'st', 'avenue', 'ave', 'road', 'rd', 'lane', 'ln', 
      'drive', 'dr', 'boulevard', 'blvd', 'court', 'ct', 'way', 
      'highway', 'hwy', 'circle', 'cir', 'place', 'pl'
    ];

    const addressCandidates = lines.filter(line => {
      const lowerLine = line.toLowerCase();
      const hasAddressWord = addressIndicators.some(word => 
        lowerLine.includes(word)
      );
      const hasNumberAndStreet = line.match(/\d+\s+[A-Za-z]/);
      const hasCityStateZip = line.match(/[A-Za-z]+,\s*[A-Z]{2}\s*\d{5}/);
      const hasZipCode = line.match(/\b\d{5}(-\d{4})?\b/);
      
      return (hasAddressWord || hasNumberAndStreet || hasCityStateZip || hasZipCode) && 
             !line.includes('@') && // Not email
             line.length > 5; // Not too short
    });

    if (addressCandidates.length > 0) {
      address = addressCandidates[0];
      // Try to get additional address lines
      const addressIndex = lines.indexOf(addressCandidates[0]);
      if (addressIndex < lines.length - 1) {
        const nextLine = lines[addressIndex + 1];
        if (nextLine.match(/[A-Za-z]+,\s*[A-Z]{2}\s*\d{5}/) || nextLine.match(/\b\d{5}\b/)) {
          address += ', ' + nextLine;
        }
      }
    }

    return { name, address, phoneNumber, rawText: text };
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = event.target.files;
    if (!files) return;

    setProcessing(true);

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;

      setProcessingFile(file.name);
      const imageUrl = URL.createObjectURL(file);
      
      try {
        // Use Google Cloud Vision OCR
        const extractedText = await googleVisionOCR(file);
        const structuredData = extractStructuredData(extractedText);

        const newImage: StoredImage = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          imageUrl,
          text: extractedText,
          name: structuredData.name,
          address: structuredData.address,
          phoneNumber: structuredData.phoneNumber,
          timestamp: Date.now()
        };

        setImages(prev => [...prev, newImage]);
      } catch (error) {
        console.error('Processing error:', error);
        // Fallback: create entry with error message
        const newImage: StoredImage = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          imageUrl,
          text: 'Error: Failed to extract text from image',
          name: '',
          address: '',
          phoneNumber: '',
          timestamp: Date.now()
        };
        setImages(prev => [...prev, newImage]);
      }
    }

    setProcessing(false);
    setProcessingFile('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const deleteImage = (id: string): void => {
    const imageToDelete = images.find(img => img.id === id);
    if (imageToDelete) {
      URL.revokeObjectURL(imageToDelete.imageUrl); // Clean up memory
    }
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const filteredImages = images.filter(image =>
    image.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    image.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    image.phoneNumber.includes(searchTerm) ||
    image.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold -800 mb-2">traft.</h1>
          <p className="-600">track package.</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-center mb-8">
          <div className=" rounded-lg p-1 border">
            <button
              onClick={() => setUploadMode(true)}
              disabled={processing}
              className={`px-6 py-2 rounded-md transition-colors ${
                uploadMode ? 'bg-blue-500 text-white' : '-600 hover:'
              } ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Upload
            </button>
            <button
              onClick={() => setUploadMode(false)}
              disabled={processing}
              className={`px-6 py-2 rounded-md transition-colors ${
                !uploadMode ? 'bg-blue-500 text-white' : '-600 hover:'
              } ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              View Documents ({images.length})
            </button>
          </div>
        </div>

        {uploadMode ? (
          <div className=" rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              multiple
              disabled={processing}
              className="hidden"
            />
            
            {processing ? (
              <div className="space-y-4">
                <div className="w-20 h-20 mx-auto bg-blue-100 rounded-2xl flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div>
                  <p className="-800 font-semibold text-lg mb-2">Processing Images</p>
                  <p className="-500 text-sm">Extracting text from: {processingFile}</p>
                  <p className="-400 text-xs mt-2">Using Google Vision API...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-20 h-20 mx-auto bg-blue-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="-800 font-semibold text-lg mb-2">Upload Documents</p>
                  <p className="-500 text-sm">Select multiple images • Google Vision API will extract text</p>
                  <p className="text-xs -400 mt-1">
                    Supports: JPEG, PNG, GIF, BMP, WEBP, PDF, TIFF
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
                >
                  Choose Files
                </button>
              </div>
            )}

            {images.length > 0 && !processing && (
              <div className="mt-8">
                <button
                  onClick={() => setUploadMode(false)}
                  className="text-blue-500 hover:text-blue-600 font-semibold"
                >
                  View {images.length} document{images.length !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Search */}
            <div className=" rounded-lg border p-4">
              <input
                type="text"
                placeholder="Search by name, address, phone, or any extracted text..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="text-sm">
              {filteredImages.length} of {images.length} documents
              {searchTerm && ` matching "${searchTerm}"`}
            </div>

            {filteredImages.length === 0 ? (
              <div className="text-center py-12  rounded-xl border">
                <p className=" text-lg">
                  {searchTerm ? 'No documents match your search' : 'No documents uploaded yet'}
                </p>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="text-blue-500 hover:text-blue-600 mt-2"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredImages.map((image) => (
                  <div key={image.id} className=" rounded-xl border overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="h-48 overflow-hidden ">
                      <img 
                        src={image.imageUrl} 
                        alt="Document"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    
                    <div className="p-4 space-y-3">
                      <div className="space-y-2">
                        {image.name && (
                          <p className="text-sm">
                            <span className="font-medium ">Name:</span> {image.name}
                          </p>
                        )}
                        {image.address && (
                          <p className="text-sm">
                            <span className="font-medium ">Address:</span> {image.address}
                          </p>
                        )}
                        {image.phoneNumber && (
                          <p className="text-sm">
                            <span className="font-medium ">Phone:</span> {image.phoneNumber}
                          </p>
                        )}
                        {!image.name && !image.address && !image.phoneNumber && image.text !== 'Error: Failed to extract text from image' && (
                          <p className="text-orange-500 text-sm">No structured data detected in image</p>
                        )}
                        {image.text === 'Error: Failed to extract text from image' && (
                          <p className="text-red-500 text-sm">Failed to process image</p>
                        )}
                      </div>

                      <details className="text-sm">
                        <summary className="cursor-pointer text-blue-500 hover:text-blue-600 font-medium">
                          View Extracted Text
                        </summary>
                        <div className="mt-2 p-3 bg-gray-50 rounded border text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {image.text}
                        </div>
                      </details>
                      
                      <div className="flex justify-between items-center pt-2 border-t">
                        <button
                          onClick={() => deleteImage(image.id)}
                          className="text-red-500 hover:text-red-600 text-sm font-medium"
                        >
                          Delete
                        </button>
                        <span className="text-xs ">
                          {new Date(image.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-center">
              <button
                onClick={() => setUploadMode(true)}
                className="text-blue-500 hover:text-blue-600 font-semibold"
              >
                Upload More Documents
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OCRUpload;