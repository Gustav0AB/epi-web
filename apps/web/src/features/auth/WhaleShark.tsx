import { useId } from "react";

const body = "M 181 139 C 250 134 303 118 370 105 C 466 87 551 79 653 82 C 742 84 829 96 902 113 C 927 119 947 127 950 138 C 954 151 940 165 915 176 C 871 195 801 204 728 207 C 617 212 529 199 432 181 C 339 164 259 152 181 153 Z";
const tail = "M 224 135 C 188 141 165 130 143 106 C 114 75 75 42 25 20 C 54 56 68 83 79 111 C 89 133 109 146 137 149 C 113 167 93 195 67 243 C 109 228 139 202 159 175 C 177 154 197 153 224 157 Z";
const dorsal = "M 443 104 C 472 89 474 61 467 27 C 511 44 543 76 573 101 Z";
const fin = "M 681 174 C 653 160 626 173 602 199 C 580 224 554 245 523 259 C 567 270 614 255 647 233 C 678 211 697 184 681 174 Z";

export function WhaleShark() {
  const id = useId();
  const skin = `url(#${id}-skin)`;
  const spots = `url(#${id}-spots)`;

  return (
    <svg className="login-ocean__swimmer-art" viewBox="0 0 960 282" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-skin`} x1="0" y1="54" x2="5" y2="230" gradientUnits="userSpaceOnUse">
          <stop stopColor="#526d80" />
          <stop offset=".42" stopColor="#426878" />
          <stop offset=".75" stopColor="#547986" />
          <stop offset="1" stopColor="#a9bdba" />
        </linearGradient>
        <linearGradient id={`${id}-fin`} x1="667" y1="169" x2="562" y2="269" gradientUnits="userSpaceOnUse">
          <stop stopColor="#577987" />
          <stop offset="1" stopColor="#365365" />
        </linearGradient>
        <pattern id={`${id}-spots`} width="63" height="41" patternUnits="userSpaceOnUse" patternTransform="rotate(7)">
          <path d="M 0 0 V 41 M 31.5 0 V 41" stroke="#c3d5ce" strokeOpacity=".13" strokeWidth="1.1" />
          <g fill="#cfdfd6">
            <ellipse cx="9" cy="8" rx="2.9" ry="2.3" opacity=".85" />
            <ellipse cx="22" cy="24" rx="3.3" ry="2.7" opacity=".8" />
            <ellipse cx="40" cy="13" rx="3.4" ry="2.6" opacity=".86" />
            <ellipse cx="54" cy="30" rx="2.7" ry="2.2" opacity=".72" />
            <circle cx="9" cy="35" r="1.6" opacity=".63" />
          </g>
        </pattern>
        <clipPath id={`${id}-body`}><path d={body} /></clipPath>
      </defs>
      <g className="login-ocean__tail">
        <path d={tail} fill={skin} />
        <path d={tail} fill={spots} opacity=".57" />
        <path d="M 29 24 C 85 53 126 102 160 128 M 72 237 C 113 219 146 181 162 160" fill="none" stroke="#9fb8bb" strokeOpacity=".27" strokeWidth="2.5" />
      </g>
      <path d="M 302 128 Q 314 111 314 91 Q 335 103 354 122 Z" fill={skin} />
      <path d={dorsal} fill={skin} />
      <path d={dorsal} fill={spots} opacity=".62" />
      <path d="M 327 156 C 314 172 292 184 273 194 C 318 195 347 183 375 169 Z M 447 174 C 428 195 406 203 374 213 C 417 220 457 201 478 184 Z" fill="#426475" />
      <path d="M 705 174 C 679 201 650 223 607 237 C 624 245 665 238 691 216 C 713 197 725 186 705 174 Z" fill="#365868" />
      <path d={body} fill={skin} />
      <g clipPath={`url(#${id}-body)`}>
        <path d={body} fill={spots} />
        <path d="M 195 149 C 378 144 511 192 662 188 C 784 189 898 177 948 148 L 958 230 H 192 Z" fill="#b6c8bf" opacity=".67" />
        <path d="M 224 140 C 376 124 527 88 655 95 C 765 98 850 114 922 130 M 283 144 C 455 130 528 115 653 118 C 755 120 843 134 917 142 M 336 151 C 466 148 566 141 653 144 C 767 147 841 153 905 155" fill="none" stroke="#adccd0" strokeWidth="2.5" strokeOpacity=".23" />
      </g>
      <g fill="none" stroke="#284752" strokeWidth="3" strokeOpacity=".75" strokeLinecap="round">
        <path d="M 708 127 Q 719 153 710 181 M 720 129 Q 732 154 724 183 M 733 132 Q 745 156 738 183 M 746 135 Q 757 157 751 183 M 759 139 Q 769 158 764 181" />
        <path d="M 947 149 Q 926 153 902 151" />
      </g>
      <ellipse cx="889" cy="137" rx="4.3" ry="3.1" fill="#203c49" />
      <circle cx="890.1" cy="136.1" r="1" fill="#bbcfc9" />
      <g className="login-ocean__pectoral">
        <path d={fin} fill={`url(#${id}-fin)`} />
        <path d={fin} fill={spots} opacity=".58" />
        <path d="M 676 177 C 636 169 607 225 540 256" fill="none" stroke="#afc7c6" strokeOpacity=".33" strokeWidth="2.8" strokeLinecap="round" />
      </g>
    </svg>
  );
}
