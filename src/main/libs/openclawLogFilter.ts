const MISSING_OPTIONAL_PLUGIN_PATTERN = /plugins\.entries\.([A-Za-z0-9_.-]+): plugin not installed:/i;

export class OpenClawStartupLogFilter {
  private readonly missingOptionalPlugins = new Set<string>();

  public filter(text: string): string {
    const trailingNewline = text.endsWith('\n');
    const lines = text.split(/\r?\n/);
    if (trailingNewline) lines.pop();
    const kept = lines.filter((line) => {
      const match = line.match(MISSING_OPTIONAL_PLUGIN_PATTERN);
      if (!match) return true;
      const pluginId = match[1].toLowerCase();
      if (this.missingOptionalPlugins.has(pluginId)) return false;
      this.missingOptionalPlugins.add(pluginId);
      return true;
    });
    const filtered = kept.join('\n');
    return trailingNewline && filtered ? `${filtered}\n` : filtered;
  }
}
