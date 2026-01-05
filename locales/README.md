# Translation Guide

This directory contains translation files for WhatsApp Dual. Each JSON file represents a different language.

## Available Languages

| Code | Language | File |
|------|----------|------|
| en | English | `en.json` |
| es | Spanish | `es.json` |

## How to Add a New Language

1. Copy `en.json` to a new file named with your language code (e.g., `fr.json` for French, `pt.json` for Portuguese)
2. Translate all the values (right side of the colon) keeping the keys (left side) unchanged
3. Test your translation by running the app with `npm start`
4. Submit a Pull Request with your new translation file

## Language Codes Reference

| Code | Language   |
|------|------------|
| en   | English    |
| es   | Spanish    |
| pt   | Portuguese |
| fr   | French     |
| de   | German     |
| it   | Italian    |
| ru   | Russian    |
| zh   | Chinese    |
| ja   | Japanese   |
| ko   | Korean     |
| ar   | Arabic     |

## File Structure

Translation files follow this JSON structure:

```json
{
  "section": {
    "key": "Translated text"
  }
}
```

### Example

```json
{
  "menu": {
    "personal": "Personal",
    "business": "Business",
    "settings": "Settings"
  }
}
```

## Important Notes

- Keep the JSON structure intact
- Do not translate the keys, only the values
- Test your translation before submitting
- If a term should remain in English (like "WhatsApp"), keep it as is
- Ensure proper UTF-8 encoding for special characters

## Testing Your Translation

1. Add your translation file to the `locales/` directory
2. Run the application: `npm start`
3. Go to Settings and select your language
4. Verify all text appears correctly throughout the app

## Need Help?

If you have questions about contributing translations, please open an issue on GitHub.
