"""
Script to extract metadata from template README.md files and update templates.json
"""
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional


def parse_yaml_frontmatter(content: str) -> Optional[Dict[str, Any]]:
    """
    Extract YAML frontmatter from markdown content.
    
    Args:
        content: The markdown file content
        
    Returns:
        Dictionary of metadata or None if no frontmatter found
    """
    pattern = r'^---\s*\n(.*?)\n---\s*\n'
    match = re.match(pattern, content, re.DOTALL)
    
    if not match:
        return None
    
    frontmatter = match.group(1)
    metadata = {}
    
    for line in frontmatter.split('\n'):
        line = re.sub(r'#.*$', '', line).strip()
        
        if not line or ':' not in line:
            continue
            
        key, value = line.split(':', 1)
        key = key.strip()
        value = value.strip()
        
        if value.startswith('[') and value.endswith(']'):
            items = value[1:-1].split(',')
            metadata[key] = [item.strip() for item in items if item.strip()]
        elif not value:
            metadata[key] = None
        else:
            metadata[key] = value
    
    return metadata


def get_template_name_from_path(readme_path: str) -> str:
    """Extract template folder name from README path."""
    path = Path(readme_path)
    return path.parent.name


def update_templates_json(readme_path: str, repo_root: str) -> None:
    """Update templates.json with metadata from a README file."""
    readme_full_path = Path(repo_root) / readme_path
    
    if not readme_full_path.exists():
        print(f"Error: README file not found: {readme_full_path}")
        sys.exit(1)
    
    # Skip template folders that start with underscore
    template_name = get_template_name_from_path(readme_path)
    if template_name.startswith('_'):
        print(f"Skipping template folder: {template_name} (starts with underscore)")
        return
    
    with open(readme_full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    metadata = parse_yaml_frontmatter(content)
    
    if not metadata:
        print(f"Warning: No frontmatter found in {readme_path}")
        return
    
    # Add last commit date from environment variable if available
    last_commit_date = os.environ.get('LAST_COMMIT_DATE')
    if last_commit_date:
        metadata['last-commit-date'] = last_commit_date.strip()
    
    template_name = get_template_name_from_path(readme_path)
    templates_json_path = Path(repo_root) / 'templates.json'
    
    if templates_json_path.exists():
        with open(templates_json_path, 'r', encoding='utf-8') as f:
            templates_data = json.load(f)
    else:
        templates_data = {}
    
    templates_data[template_name] = metadata
    
    with open(templates_json_path, 'w', encoding='utf-8') as f:
        json.dump(templates_data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    
    print(f"Updated templates.json with metadata from {template_name}")


def main():
    """Main entry point for the script."""
    if len(sys.argv) < 2:
        print("Usage: python update_templates_json.py <readme_path>")
        sys.exit(1)
    
    readme_path = sys.argv[1]
    repo_root = os.environ.get('GITHUB_WORKSPACE', '.')
    
    update_templates_json(readme_path, repo_root)
    print(f"Successfully processed {readme_path}")


if __name__ == '__main__':
    main()
