import type { ImgHTMLAttributes } from 'react';
/** Isolated rendering tests exercise layout with the same logo dimensions. */
export default function FixtureImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ''} />;
}
