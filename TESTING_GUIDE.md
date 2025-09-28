# Business Metadata Testing Guide

## Overview
This guide provides comprehensive testing scenarios for the business metadata filtering functionality in the PDF AI Assistant similarity search feature.

## Test Data Requirements

### Sample Documents Needed
To properly test the business metadata functionality, you'll need documents with the following combinations:

#### Scenario 1: Law Firm Testing
- **Document A**: STB + Blackstone + Standish + Delaware
- **Document B**: STB + KKR + CITCO + Cayman Islands  
- **Document C**: Proskauer + Blackstone + Standish + Delaware
- **Document D**: Proskauer + KKR + CITCO + Cayman Islands

#### Scenario 2: Mixed Metadata
- **Document E**: STB + N/A + N/A + N/A (Law firm only)
- **Document F**: N/A + Blackstone + N/A + N/A (Fund manager only)
- **Document G**: N/A + N/A + Standish + N/A (Fund admin only)
- **Document H**: N/A + N/A + N/A + Delaware (Jurisdiction only)

#### Scenario 3: All N/A
- **Document I**: N/A + N/A + N/A + N/A (No business metadata)

## Manual Testing Checklist

### 1. UI Filter Testing
- [ ] All filter dropdowns display correctly
- [ ] Each dropdown shows "Any [category]" as default
- [ ] Can select specific values from each dropdown
- [ ] Can reset all filters using Reset button
- [ ] Filters maintain selection after page refresh
- [ ] Dark mode displays filters correctly

### 2. Single Filter Testing
Test each filter individually:

#### Law Firm Filter
- [ ] Filter by "STB" - should return Documents A, B, E
- [ ] Filter by "Proskauer" - should return Documents C, D
- [ ] Filter by "Any law firm" - should return all documents

#### Fund Manager Filter  
- [ ] Filter by "Blackstone" - should return Documents A, C, F
- [ ] Filter by "KKR" - should return Documents B, D
- [ ] Filter by "Any fund manager" - should return all documents

#### Fund Admin Filter
- [ ] Filter by "Standish" - should return Documents A, C, G  
- [ ] Filter by "CITCO" - should return Documents B, D
- [ ] Filter by "Any fund admin" - should return all documents

#### Jurisdiction Filter
- [ ] Filter by "Delaware" - should return Documents A, C, H
- [ ] Filter by "Cayman Islands" - should return Documents B, D
- [ ] Filter by "Any jurisdiction" - should return all documents

### 3. Multiple Filter Combinations
- [ ] STB + Blackstone - should return Document A only
- [ ] STB + KKR - should return Document B only
- [ ] Proskauer + Delaware - should return Document C only
- [ ] Blackstone + Standish - should return Documents A, C
- [ ] All specific filters selected - should return no results (no document matches all)

### 4. Edge Cases
- [ ] No documents match filter criteria - shows "No Similar Documents Found"
- [ ] Source document matches filter - should be excluded from results
- [ ] All filters set to "Any" - should return all similar documents
- [ ] Filter + minimum similarity score - both criteria applied
- [ ] Filter + page range - both criteria applied

### 5. Search Results Display
- [ ] Business metadata badges display correctly for each result
- [ ] Color coding works: Law Firm (Blue), Fund Manager (Green), Fund Admin (Purple), Jurisdiction (Orange)
- [ ] "N/A" values are hidden from display
- [ ] Business Details section only shows when metadata exists
- [ ] Results respect the selected filters

## API Testing with Browser Dev Tools

### Test Similarity Search API Endpoint
**URL:** `POST /api/documents/[id]/similar`

#### Request Body Examples:

```json
// Test 1: Law Firm Filter
{
  "filters": {
    "law_firm": ["STB"],
    "min_score": 0.7,
    "page_range": {
      "use_entire_document": true
    }
  },
  "topK": 20
}

// Test 2: Multiple Filters
{
  "filters": {
    "law_firm": ["STB"],
    "fund_manager": ["Blackstone"],
    "min_score": 0.7,
    "page_range": {
      "use_entire_document": true
    }
  },
  "topK": 20
}

// Test 3: All Filters
{
  "filters": {
    "law_firm": ["Proskauer"],
    "fund_manager": ["KKR"],
    "fund_admin": ["CITCO"],
    "jurisdiction": ["Cayman Islands"],
    "min_score": 0.7,
    "page_range": {
      "use_entire_document": true
    }
  },
  "topK": 20
}
```

### Expected Console Output
Check browser console for these log messages:
- `🔍 Building metadata filters for similarity search...`
- `📋 Law Firm filter: [STB]` (when law firm filter applied)
- `💼 Fund Manager filter: [Blackstone]` (when fund manager filter applied)
- `🏢 Fund Admin filter: [CITCO]` (when fund admin filter applied)
- `🌍 Jurisdiction filter: [Delaware]` (when jurisdiction filter applied)
- `📊 Active metadata filters: [...]`
- `🎯 Final Pinecone filter: {...}`

## Performance Testing
- [ ] Search with no filters completes in reasonable time
- [ ] Search with single filter completes in reasonable time
- [ ] Search with multiple filters completes in reasonable time
- [ ] Large result sets display without performance issues

## Error Handling Testing
- [ ] Invalid filter values handled gracefully
- [ ] Network errors display appropriate messages
- [ ] Search cancellation works correctly
- [ ] Malformed API requests return proper error responses

## Accessibility Testing
- [ ] All filter dropdowns accessible via keyboard
- [ ] Screen reader compatibility for filter labels
- [ ] High contrast mode displays filters clearly
- [ ] Filter labels are descriptive and clear

## Mobile Responsiveness
- [ ] Filter dropdowns work on mobile devices
- [ ] Filter layout adapts to smaller screens (4 columns → responsive)
- [ ] Touch interactions work properly
- [ ] Business metadata badges wrap correctly on mobile

## Browser Compatibility
Test in major browsers:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

## Documentation of Issues
When you find issues, document them with:
1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Browser/device information**
5. **Screenshots if applicable**

## Success Criteria
✅ All filter combinations return expected results
✅ UI displays business metadata correctly
✅ API logs show proper filter application
✅ Performance is acceptable for all scenarios
✅ Error handling works as expected
✅ Mobile and accessibility requirements met