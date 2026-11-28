import type { Bilingual } from '../../content/landing.ts';
import children from '../../assets/home/children-kindness-clothes.jpg';
import banner from '../../assets/home/banner-children-smile.jpg';
import contact from '../../assets/home/contact-volunteers.jpg';
import bannerBg from '../../assets/home/children-food-kits.jpg';
import donate from '../../assets/home/donate-schoolchildren-cheer.jpg';
import education from '../../assets/home/education-girls-slate.jpg';
import elderly from '../../assets/home/elderly-women-meal.jpg';
import healthcare from '../../assets/home/healthcare-doctor-talk.jpg';
import talk from '../../assets/home/talk-helping-hand.jpg';
import vision from '../../assets/home/vision-children-walk.jpg';

/**
 * SAMPLE photos for the home page design (client, Nov 2026): real camera photos from Unsplash
 * and Pexels (free licences, no credit needed). Activity photos are from Tamil Nadu / South India so local visitors
 * connect with them (client). They are NOT the trust's beneficiaries — replace every one with the trust's
 * own photos (with consent) before launch.
 */
export interface HomePhoto {
  src: string;
  alt: Bilingual;
  credit: { author: string; license: string; url: string };
}

export const PHOTOS = {
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
      en: 'Smiling schoolgirls in uniform, one holding a slate that says "Education"',
      ta: '"Education" என்று எழுதிய சிலேட்டைப் பிடித்தபடி சிரிக்கும் சீருடைப் பள்ளி மாணவிகள்',
    },
    credit: {
      author: 'Supplied by the client',
      license: 'Client supplied',
      url: '',
    },
  },
  children: {
    src: children,
    alt: {
      en: 'A volunteer handing folded clothes to smiling schoolchildren',
      ta: 'சிரிக்கும் பள்ளிக் குழந்தைகளுக்கு மடித்த உடைகளைக் கொடுக்கும் ஒரு தன்னார்வலர்',
    },
    credit: {
      author: 'Supplied by the client',
      license: 'Client supplied',
      url: '',
    },
  },
  healthcare: {
    src: healthcare,
    alt: {
      en: 'A doctor talking with patients at an outdoor health check-up',
      ta: 'வெளியில் நடக்கும் மருத்துவ முகாமில் நோயாளிகளோடு பேசும் மருத்துவர்',
    },
    credit: {
      author: 'Supplied by the client',
      license: 'Client supplied',
      url: '',
    },
  },
  elderly: {
    src: elderly,
    alt: {
      en: 'Elderly women in saris sitting together with a meal',
      ta: 'உணவோடு ஒன்றாக அமர்ந்திருக்கும் சேலை அணிந்த முதிய பெண்கள்',
    },
    credit: {
      author: 'Supplied by the client',
      license: 'Client supplied',
      url: '',
    },
  },
  donate: {
    src: donate,
    alt: {
      en: 'Schoolchildren in uniform smiling and waving at the camera',
      ta: 'சீருடையில் சிரித்தபடி கை அசைக்கும் பள்ளிக் குழந்தைகள்',
    },
    credit: {
      author: 'Church of the King (Unsplash)',
      license: 'Unsplash License',
      url: 'https://unsplash.com/photos/group-of-children-taking-picture-j9jZSqfH5YI',
    },
  },
  banner: {
    src: banner,
    alt: {
      en: 'Five children smiling together',
      ta: 'ஒன்றாக நின்று சிரிக்கும் ஐந்து குழந்தைகள்',
    },
    credit: {
      author: 'LJ (Unsplash)',
      license: 'Unsplash License',
      url: 'https://unsplash.com/photos/five-children-smiling-XoBWUBA3Amg',
    },
  },
  contact: {
    src: contact,
    alt: {
      en: 'Three volunteers in yellow T-shirts helping at a community event',
      ta: 'ஒரு பொது நிகழ்வில் உதவும் மஞ்சள் சட்டை அணிந்த மூன்று தன்னார்வலர்கள்',
    },
    credit: {
      author: 'Rashpal Singh (Unsplash)',
      license: 'Unsplash License',
      url: 'https://unsplash.com/photos/three-men-wearing-yellow-volunteers-shirts-qKVSEuBT5EY',
    },
  },
  /** Donate Today background: the earlier food-kits photo (client, 28 Nov 2026: keep it). */
  bannerBg: {
    src: bannerBg,
    alt: {
      en: 'A volunteer handing food kits to smiling children',
      ta: 'சிரிக்கும் குழந்தைகளுக்கு உணவுப் பொட்டலங்களைக் கொடுக்கும் ஒரு தன்னார்வலர்',
    },
    credit: {
      author: 'Supplied by the client',
      license: 'Client supplied',
      url: '',
    },
  },
  /** "Talk to us" background (client, 28 Nov 2026): an outstretched hand and a small child. */
  talk: {
    src: talk,
    alt: {
      en: 'An adult hand reaching out to hold a small child’s hand',
      ta: 'ஒரு சிறு குழந்தையின் கையைப் பிடிக்க நீளும் ஒரு பெரியவரின் கை',
    },
    credit: {
      author: 'Supplied by the client',
      license: 'Client supplied',
      url: '',
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
