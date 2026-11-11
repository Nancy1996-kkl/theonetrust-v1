import type { Bilingual } from '../../content/landing.ts';
import children from '../../assets/home/children-girl.jpg';
import contact from '../../assets/home/contact-smiles.jpg';
import donate from '../../assets/home/donate-children.jpg';
import education from '../../assets/home/education-schoolgirls.jpg';
import elderly from '../../assets/home/elderly-women.jpg';
import healthcare from '../../assets/home/healthcare-camp.jpg';
import hero from '../../assets/home/hero-children.jpg';
import vision from '../../assets/home/vision-children-walk.jpg';

/**
 * SAMPLE photos for the home page design (client, Nov 2026): real camera photos from Unsplash
 * (Unsplash License, no credit needed) and Flickr (Creative Commons — credited on hover, as the
 * licence requires). They are NOT the trust's beneficiaries — replace every one with the trust's
 * own photos (with consent) before launch.
 */
export interface HomePhoto {
  src: string;
  alt: Bilingual;
  credit: { author: string; license: string; url: string };
}

const BY = 'CC BY 2.0';

export const PHOTOS = {
  hero: {
    src: hero,
    alt: {
      en: 'A group of smiling children standing together',
      ta: 'ஒன்றாகச் சிரித்தபடி நிற்கும் குழந்தைகள்',
    },
    credit: {
      author: 'Unsplash',
      license: 'Unsplash License',
      url: 'https://unsplash.com/license',
    },
  },
  vision: {
    src: vision,
    alt: {
      en: 'Children sitting together in a school yard',
      ta: 'பள்ளி வளாகத்தில் ஒன்றாக அமர்ந்திருக்கும் குழந்தைகள்',
    },
    credit: {
      author: 'Unsplash',
      license: 'Unsplash License',
      url: 'https://unsplash.com/license',
    },
  },
  education: {
    src: education,
    alt: {
      en: 'Schoolgirls in uniform walking to school',
      ta: 'சீருடையில் பள்ளிக்குச் செல்லும் மாணவிகள்',
    },
    credit: {
      author: 'Nithi clicks',
      license: BY,
      url: 'https://www.flickr.com/photos/47850033@N08/47393681652',
    },
  },
  children: {
    src: children,
    alt: {
      en: 'Two children playing together outdoors',
      ta: 'வெளியே ஒன்றாக விளையாடும் இரண்டு குழந்தைகள்',
    },
    credit: {
      author: 'Unsplash',
      license: 'Unsplash License',
      url: 'https://unsplash.com/license',
    },
  },
  healthcare: {
    src: healthcare,
    alt: {
      en: 'A doctor talking a patient through her report',
      ta: 'நோயாளியிடம் அறிக்கையை விளக்கும் மருத்துவர்',
    },
    credit: {
      author: 'Unsplash',
      license: 'Unsplash License',
      url: 'https://unsplash.com/license',
    },
  },
  elderly: {
    src: elderly,
    alt: { en: 'A group of smiling older women', ta: 'புன்னகைக்கும் வயதான பெண்கள்' },
    credit: {
      author: 'Find Your Feet',
      license: BY,
      url: 'https://www.flickr.com/photos/31042566@N06/3693611933',
    },
  },
  donate: {
    src: donate,
    alt: {
      en: 'Schoolboys in uniform smiling and waving together',
      ta: 'சீருடையில் சிரித்தபடி கையசைக்கும் பள்ளி மாணவர்கள்',
    },
    credit: {
      author: 'Unsplash',
      license: 'Unsplash License',
      url: 'https://unsplash.com/license',
    },
  },
  contact: {
    src: contact,
    alt: {
      en: 'Many hands joined together in the middle of a circle',
      ta: 'வட்டமாக நின்று நடுவில் ஒன்றாகச் சேர்த்த பல கைகள்',
    },
    credit: {
      author: 'Unsplash',
      license: 'Unsplash License',
      url: 'https://unsplash.com/license',
    },
  },
} satisfies Record<string, HomePhoto>;

/** Explore tab → photo. */
export const TAB_PHOTOS: Record<string, HomePhoto | undefined> = {
  education: PHOTOS.education,
  children: PHOTOS.children,
  healthcare: PHOTOS.healthcare,
  elderly: PHOTOS.elderly,
};
