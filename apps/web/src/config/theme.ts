/** Brand palette and semantic tokens shared by the application and its components. */
export const brandColors = {
  blue: "#4197B5",
  orange: "#EF8200",
  white: "#FFFFFF",
  darkBlue: "#35587D",
  darkTurquoise: "#55BAB7",
  lightTurquoise: "#9ED6D3",
  red: "#E1261C",
  lightGreen: "#ADC687",
  purple: "#766A8A",
  gold: "#FFD451",
  gray: "#687072",
  black: "#000000",
} as const;

export const colors = {
  "brand-blue": brandColors.blue,
  "brand-orange": brandColors.orange,
  "brand-white": brandColors.white,
  "brand-dark-blue": brandColors.darkBlue,
  "brand-dark-turquoise": brandColors.darkTurquoise,
  "brand-light-turquoise": brandColors.lightTurquoise,
  "brand-red": brandColors.red,
  "brand-light-green": brandColors.lightGreen,
  "brand-purple": brandColors.purple,
  "brand-gold": brandColors.gold,
  "brand-gray": brandColors.gray,
  "brand-black": brandColors.black,
  primary: brandColors.blue,
  "primary-hover": brandColors.darkBlue,
  "primary-pressed": "#29445f",
  "primary-muted": "#e8f2f5",
  "primary-ink": brandColors.darkBlue,
  "primary-contrast": brandColors.black,
  secondary: brandColors.orange,
  "secondary-hover": "#d47300",
  "secondary-muted": "#fef3e2",
  danger: brandColors.red,
  "danger-hover": "#b91c1c",
  "danger-ink": "#b91c1c",
  "danger-muted": "#fef2f2",
  success: "#167238",
  "success-muted": "#f0fdf4",
  warning: "#975a00",
  "warning-muted": "#fffbeb",
} as const;

export const fonts = {
  body: 'Calibri, system-ui, -apple-system, "Segoe UI", sans-serif',
  heading: 'Cambria, Georgia, serif',
} as const;

export type ThemeColor = keyof typeof colors;
