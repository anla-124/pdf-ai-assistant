#!/bin/bash

# =====================================================
# Cleanup Script for Old Database Schema Files
# =====================================================
# This script moves old database migration files to an archive folder
# since they've been consolidated into database-complete-schema.sql
# =====================================================

echo "🗂️  Consolidating old database schema files..."

# Create archive directory
mkdir -p database-archive

# List of old files to archive
OLD_FILES=(
    "database-setup.sql"
    "database-page-migration.sql"
    "database-page-count-migration.sql"
    "database-batch-update.sql"
)

echo ""
echo "📦 Archiving old schema files:"

# Move each file if it exists
for file in "${OLD_FILES[@]}"; do
    if [ -f "$file" ]; then
        mv "$file" database-archive/
        echo "   ✅ Moved $file to database-archive/"
    else
        echo "   ⚠️  $file not found (already archived or deleted)"
    fi
done

echo ""
echo "✅ Schema consolidation complete!"
echo ""
echo "📋 Current status:"
echo "   ✅ database-complete-schema.sql - USE THIS FILE"
echo "   📁 database-archive/ - Old files archived here"
echo ""
echo "🎯 Next steps:"
echo "   1. Use database-complete-schema.sql for new installations"
echo "   2. See DATABASE_MIGRATION_GUIDE.md for existing installations"
echo "   3. You can safely delete database-archive/ folder if desired"
echo ""