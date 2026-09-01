import { formatDate } from './date-utils';

export interface TemplateVariables {
  title: string;
  date?: string;
  time?: string;
  datetime?: string;
  [key: string]: string | undefined;
}

/**
 * Renders a note template replacing variables like ${title}, ${date}, ${time}, ${datetime}.
 */
export function renderTemplate(
  template: string,
  variables: TemplateVariables,
  dateFormat = 'YYYY-MM-DD'
): string {
  const now = new Date();
  const dateStr = variables.date || formatDate(now, dateFormat);
  const timeStr = variables.time || formatDate(now, 'HH:mm:ss');
  const datetimeStr = variables.datetime || `${dateStr} ${timeStr}`;

  const allVars: Record<string, string> = {
    title: variables.title,
    date: dateStr,
    time: timeStr,
    datetime: datetimeStr,
    ...Object.fromEntries(
      Object.entries(variables).filter(([, v]) => v !== undefined)
    ) as Record<string, string>,
  };

  return template.replace(/\$\{([a-zA-Z0-9_-]+)\}/g, (_, key) => {
    return allVars[key] !== undefined ? allVars[key] : `\${${key}}`;
  });
}
