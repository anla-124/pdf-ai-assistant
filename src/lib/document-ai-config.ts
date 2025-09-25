// Document AI processor configuration

export const PROCESSOR_TYPES = {
  FORM_PARSER: 'form_parser',
  DOCUMENT_OCR: 'ocr',
} as const;

export type ProcessorType = typeof PROCESSOR_TYPES[keyof typeof PROCESSOR_TYPES];

export function getProcessorId(type?: ProcessorType): string {
  // If no type specified, use the primary processor
  if (!type) {
    return process.env.GOOGLE_CLOUD_PROCESSOR_ID!;
  }

  // Use specific processor based on type
  switch (type) {
    case PROCESSOR_TYPES.FORM_PARSER:
      return process.env.GOOGLE_CLOUD_FORM_PARSER_ID || process.env.GOOGLE_CLOUD_PROCESSOR_ID!;
    case PROCESSOR_TYPES.DOCUMENT_OCR:
      return process.env.GOOGLE_CLOUD_OCR_PROCESSOR_ID || process.env.GOOGLE_CLOUD_PROCESSOR_ID!;
    default:
      return process.env.GOOGLE_CLOUD_PROCESSOR_ID!;
  }
}

export function getProcessorName(processorId: string): string {
  return `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/${process.env.GOOGLE_CLOUD_LOCATION}/processors/${processorId}`;
}

// Auto-detect processor type based on document characteristics
export function detectOptimalProcessor(filename: string, fileSize: number): ProcessorType {
  const fileName = filename.toLowerCase();
  
  // Keywords that suggest form-based documents
  const formKeywords = [
    'application', 'form', 'subscription', 'agreement', 'contract',
    'questionnaire', 'survey', 'registration', 'enrollment'
  ];

  // Check if filename suggests a form document
  const isLikelyForm = formKeywords.some(keyword => fileName.includes(keyword));

  // Use Form Parser for likely forms, OCR for general documents
  if (isLikelyForm) {
    return PROCESSOR_TYPES.FORM_PARSER;
  }

  // For very large documents, OCR might be faster
  if (fileSize > 10 * 1024 * 1024) { // 10MB
    return PROCESSOR_TYPES.DOCUMENT_OCR;
  }

  // Default to Form Parser for subscription documents (your use case)
  return PROCESSOR_TYPES.FORM_PARSER;
}