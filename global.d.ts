/**
 * NativeWind processes global.css through Metro, but TypeScript still needs to
 * know a side-effect CSS import is legal.
 */
declare module '*.css';
