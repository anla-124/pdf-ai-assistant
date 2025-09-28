# Testing the PDF AI Assistant

## Overview
This document provides instructions for testing the business metadata filtering functionality in the PDF AI Assistant.

## Quick Start

### 1. Install Testing Dependencies
```bash
npm install
```

### 2. Run Unit Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### 3. Manual Testing with Test Script
```bash
# Run automated API tests (replace with actual document ID)
node scripts/test-business-metadata.js your-document-id-here
```

## Testing Components

### Automated Tests

#### Unit Tests
- **Location**: `src/components/similarity/__tests__/`
- **Coverage**: SimilaritySearchForm component business metadata filters
- **Run**: `npm test`

#### API Integration Tests  
- **Location**: `src/app/api/documents/[id]/similar/__tests__/`
- **Coverage**: Similarity search API with business metadata filtering
- **Run**: `npm test route.test.ts`

#### Automated API Testing Script
- **Location**: `scripts/test-business-metadata.js`
- **Purpose**: End-to-end API testing with various filter combinations
- **Usage**: `node scripts/test-business-metadata.js <document-id>`

### Manual Testing

#### UI Testing Checklist
Use the comprehensive testing guide: `TESTING_GUIDE.md`

Key areas to test:
1. **Filter Display**: All 4 business metadata dropdowns visible
2. **Filter Selection**: Can select values from each dropdown
3. **Filter Reset**: Reset button clears all selections
4. **Search Execution**: Search with filters sends correct API requests
5. **Results Display**: Business metadata badges show correctly

#### Browser Dev Tools Testing
1. Open browser dev tools (F12)
2. Navigate to Network tab
3. Perform similarity searches with different filters
4. Inspect API requests and responses
5. Check console for filter logging messages

## Test Data Requirements

### Sample Documents Needed
To fully test business metadata functionality, upload documents with these metadata combinations:

```
Document A: STB + Blackstone + Standish + Delaware
Document B: STB + KKR + CITCO + Cayman Islands
Document C: Proskauer + Blackstone + Standish + Delaware
Document D: Proskauer + KKR + CITCO + Cayman Islands
Document E: STB + N/A + N/A + N/A
Document F: N/A + Blackstone + N/A + N/A
Document G: N/A + N/A + Standish + N/A
Document H: N/A + N/A + N/A + Delaware
Document I: N/A + N/A + N/A + N/A
```

## Expected Test Results

### Filter Combinations
- **STB Law Firm**: Should return Documents A, B, E
- **Blackstone Fund Manager**: Should return Documents A, C, F
- **STB + Blackstone**: Should return Document A only
- **All specific filters**: Should return no results (no document matches all)

### API Logging
When filters are applied, check console for these messages:
```
🔍 Building metadata filters for similarity search...
📋 Law Firm filter: [STB]
💼 Fund Manager filter: [Blackstone]
🏢 Fund Admin filter: [Standish]
🌍 Jurisdiction filter: [Delaware]
📊 Active metadata filters: [metadata.law_firm, metadata.fund_manager]
🎯 Final Pinecone filter: { ... }
```

## Troubleshooting

### Common Issues

#### Tests Fail to Run
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### API Tests Timeout
- Ensure development server is running: `npm run dev`
- Check that Supabase and Pinecone are configured
- Verify test document exists and has embeddings

#### Filter Tests Fail
- Check that metadata constants match test data
- Verify Select component behavior in test environment
- Ensure mock data matches expected format

### Debug Commands
```bash
# Run specific test file
npm test similarity-search-form.test.tsx

# Run tests with verbose output
npm test -- --verbose

# Run single test case
npm test -- --testNamePattern="should apply business metadata filters"
```

## Performance Testing

### Load Testing
```bash
# Test with multiple concurrent requests
for i in {1..10}; do
  node scripts/test-business-metadata.js your-doc-id &
done
wait
```

### Response Time Testing
Monitor API response times for:
- No filters: < 2 seconds
- Single filter: < 3 seconds  
- Multiple filters: < 4 seconds

## Continuous Integration

### GitHub Actions (Future)
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## Success Criteria

✅ **All unit tests pass** (jest reports 100% pass rate)
✅ **API tests pass** (all filter combinations work correctly)
✅ **Manual UI testing passes** (all checklist items complete)
✅ **Performance acceptable** (response times under limits)
✅ **Browser compatibility** (works in Chrome, Firefox, Safari, Edge)
✅ **Mobile responsive** (filters work on mobile devices)

## Support

- **Documentation**: See `TESTING_GUIDE.md` for detailed test scenarios
- **Issues**: Report problems with specific test steps and expected vs actual results
- **API Debugging**: Use browser dev tools Network tab to inspect requests/responses