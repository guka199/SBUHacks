import { Mark } from "../ui";
export const glassShapes = {
  flowing:
    "M .08 .16 C .18 -.04 .36 .08 .5 .05 C .72 .01 .93 .02 .98 .23 C 1.02 .42 .93 .59 .96 .76 C .99 .97 .75 1 .53 .94 C .34 1.01 .13 .98 .07 .81 C -.04 .65 .03 .41 .08 .16 Z",
  stretched:
    "M .04 .25 C .18 .03 .34 .17 .5 .1 C .73 .02 .94 .07 .98 .3 C 1.02 .48 .94 .59 .95 .74 C .94 .91 .74 .95 .53 .88 C .34 .99 .13 .96 .06 .78 C -.02 .62 .01 .41 .04 .25 Z",
  settled:
    "M .08 .16 C .12 .08 .3 .06 .5 .06 C .72 .06 .91 .07 .95 .18 C .98 .35 .97 .6 .95 .78 C .93 .91 .74 .94 .53 .94 C .32 .94 .12 .93 .08 .83 C .03 .68 .04 .36 .08 .16 Z",
};
export function LiquidGlass() {
  return (
    <>
      <svg className="liquid-filter" aria-hidden="true">
        <defs>
          <clipPath id="flowing-glass" clipPathUnits="objectBoundingBox">
            <path className="glass-contour" d={glassShapes.flowing} />
          </clipPath>
          <filter
            id="glass-refraction"
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".012 .025"
              numOctaves="2"
              seed="8"
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="softNoise"
              scale="12"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <linearGradient id="glass-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="white" stopOpacity=".95" />
            <stop offset=".35" stopColor="white" stopOpacity=".15" />
            <stop offset=".68" stopColor="#F7D87F" stopOpacity=".5" />
            <stop offset="1" stopColor="white" stopOpacity=".8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="glass-message">
        <p>Your content is everywhere.</p>
        <h2>
          Your clarity <em>shouldn’t be.</em>
        </h2>
      </div>
      <div className="liquid-field" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div className={`liquid-piece liquid-piece-${i}`} key={i}>
            <i />
            <i />
            <i />
          </div>
        ))}
        <div className="liquid-core">
          <div className="liquid-surface">
            <div className="glass-caustic" />
          </div>
          <svg
            className="glass-specular"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              className="glass-contour"
              d={glassShapes.flowing}
              fill="none"
              stroke="url(#glass-edge)"
              strokeWidth=".004"
            />
          </svg>
          <div className="liquid-meet">
            <Mark />
            <span>
              Meet <em>ViralPilot.</em>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
