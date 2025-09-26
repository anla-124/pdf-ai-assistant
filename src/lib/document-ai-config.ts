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
  
  // Both Form Parser and OCR support up to 30 pages with imageless mode
  // Form Parser: Better for structured forms (15/100 pages sync/async, 30 with imageless)
  // OCR: Better for text extraction (15/500 pages sync/async, 30 with imageless)
  
  // Keywords that suggest form-based documents
  const formKeywords = [
    'application', 'form', 'questionnaire', 'survey', 'registration', 
    'enrollment', 'contract', 'agreement', 'lp', 'l.p.', 'subscription', 
    'documents', 'document', 'fund'  // Financial/legal docs often have forms
  ];

  // Keywords that suggest text-heavy documents better suited for OCR
  const textHeavyKeywords = [
    'prospectus', 'disclosure', 'memorandum', 
    'offering', 'circular', 'supplement', 'report'
  ];

  // Check if filename suggests a form document
  const isLikelyForm = formKeywords.some(keyword => fileName.includes(keyword));
  
  // Check if filename suggests a text-heavy document
  const isLikelyTextHeavy = textHeavyKeywords.some(keyword => fileName.includes(keyword));

  // Use Form Parser for likely form documents
  if (isLikelyForm && !isLikelyTextHeavy) {
    console.log(`Using Form Parser for form document: ${filename} (${fileSize} bytes)`);
    return PROCESSOR_TYPES.FORM_PARSER;
  }

  // Default to OCR for text-heavy documents and general processing
  console.log(`Using OCR processor for document: ${filename} (${fileSize} bytes)`);
  return PROCESSOR_TYPES.DOCUMENT_OCR;
}