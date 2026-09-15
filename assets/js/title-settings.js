export const MAX_TITLE_VARIATIONS = 5;
export function titleSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    enabled: source.enabled !== false,
    phrases: (Array.isArray(source.phrases) ? source.phrases : []).slice(0, MAX_TITLE_VARIATIONS)
      .map(item => ({
        headline: typeof item?.headline === "string" ? item.headline.trim().slice(0, 120) : "",
        emphasis: typeof item?.emphasis === "string" ? item.emphasis.trim().slice(0, 80) : "",
      }))
      .filter(item => item.headline || item.emphasis),
  };
}
