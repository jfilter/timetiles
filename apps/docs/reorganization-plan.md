# Documentation Reorganization Plan

## Goal

Split documentation between user-focused and developer-focused content while maintaining the current depth and quality.

## Proposed Structure

### 1. **Getting Started** (All Audiences)

- Introduction
- What is TimeTiles?
- Quick Start Guide
- Installation Options (Cloud vs Self-hosted)

### 2. **User Documentation**

- **Guides**
  - Importing Your First Dataset
  - Creating Interactive Timelines
  - Using Filters and Search
  - Sharing and Embedding
  - Working with Different Data Formats
- **Use Cases & Examples** (current content)
- **Features**
  - Timeline Navigation
  - Map Interactions
  - Data Visualization Options
  - Export Capabilities
- **FAQ** (simplified version focusing on user questions)

### 3. **Developer Documentation**

- **Architecture** (current detailed content)
  - Tech Stack Overview
  - State Management (React Query, Zustand, nuqs)
  - Performance Optimizations
  - Data Flow
- **Technical Concepts**
  - Schema Detection (current detailed content)
  - Dynamic Filters Implementation
  - Coordinate Validation
  - Import Pipeline Architecture
- **API Reference**
  - REST Endpoints
  - WebSocket Events
  - Data Formats
  - Error Codes
- **Development**
  - Local Setup
  - Environment Configuration
  - Testing Guidelines (current content)
  - Test Debugging Guide (current content)
  - Commit Guidelines (current content)
- **Deployment**
  - Self-hosting Guide
  - Database Setup
  - Performance Tuning
  - Monitoring
- **Contributing**
  - Code Standards
  - PR Process
  - Architecture Decisions
- **Developer FAQ** (technical questions)

### 4. **Reference**

- Roadmap (current content)
- Changelog
- Migration Guides
- Glossary

## Implementation Steps

### Phase 1: Structure Creation

1. Create new directory structure under `pages/`:

   ```
   pages/
   ├── getting-started/
   ├── users/
   │   ├── guides/
   │   ├── features/
   │   └── use-cases/
   ├── developers/
   │   ├── architecture/
   │   ├── api/
   │   ├── development/
   │   └── deployment/
   └── reference/
   ```

2. Update `_meta.json` files for new navigation structure

### Phase 2: Content Migration

1. Move existing technical content to appropriate developer sections
2. Keep current content intact, just reorganize
3. Create placeholder pages for missing user guides

### Phase 3: Content Creation (Future)

1. Write user-focused guides
2. Create API documentation
3. Add deployment guides
4. Develop self-hosting documentation

## Benefits

### For Users (Journalists, Researchers, Activists)

- Clear path from installation to first visualization
- Practical guides without technical distractions
- Use case examples remain prominent
- Simplified FAQ focused on their needs

### For Developers

- All technical details preserved and properly organized
- Easy to find implementation details
- Clear separation of concerns
- Better onboarding for contributors

## Navigation Example

```json
{
  "index": "Introduction",
  "getting-started": {
    "title": "Getting Started",
    "type": "menu",
    "items": {
      "what-is-timetiles": "What is TimeTiles?",
      "quick-start": "Quick Start",
      "installation": "Installation"
    }
  },
  "users": {
    "title": "User Guide",
    "type": "menu"
  },
  "developers": {
    "title": "Developer Docs",
    "type": "menu"
  },
  "reference": {
    "title": "Reference",
    "type": "menu"
  }
}
```

## Considerations

1. **Preserve SEO**: Keep existing URLs where possible or add redirects
2. **Cross-linking**: Add "For Developers" links in user sections where appropriate
3. **Search**: Ensure Nextra search indexes all content properly
4. **Gradual Migration**: Can be done incrementally without breaking existing docs

## Next Steps

1. Review and approve this plan
2. Create directory structure
3. Begin content migration (no content loss, just reorganization)
4. Update navigation
5. Test all links and search functionality
6. Plan future content creation for gaps
