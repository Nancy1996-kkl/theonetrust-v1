import type { Bilingual } from '../../content/landing.ts';
import children from '../../assets/home/children-books-madurai.jpg';
import contact from '../../assets/home/contact-smiles.jpg';
import donate from '../../assets/home/donate-kids-smile.jpg';
import education from '../../assets/home/education-girls-study.jpg';
import elderly from '../../assets/home/elderly-grandparents.jpg';
import healthcare from '../../assets/home/healthcare-bp-check.jpg';
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
      en: 'Two schoolgirls in uniform studying at their desk',
      ta: 'மேசையில் அமர்ந்து படிக்கும் சீருடை அணிந்த இரண்டு மாணவிகள்',
    },
    credit: {
      author: 'Unsplash',
      license: 'Unsplash License',
      url: 'https://unsplash.com/s/photos/indian-school-uniform',
    },
  },
  children: {
    src: children,
    alt: {
      en: 'Schoolboys choosing Tamil books at a book fair in Madurai',
      ta: 'மதுரை புத்தகக் கண்காட்சியில் தமிழ்ப் புத்தகங்களைப் பார்க்கும் பள்ளி மாணவர்கள்',
    },
    credit: {
      author: 'Pexels',
      license: 'Pexels License',
      url: 'https://www.pexels.com/photo/children-exploring-books-at-madurai-literature-event-28963924/',
    },
  },
  healthcare: {
    src: healthcare,
    alt: {
      en: 'A doctor checking a patient’s blood pressure at a clinic',
      ta: 'மருத்துவமனையில் ஒருவரின் இரத்த அழுத்தத்தைப் பரிசோதிக்கும் மருத்துவர்',
    },
    credit: {
      author: 'Pexels',
      license: 'Pexels License',
      url: 'https://www.pexels.com/photo/a-doctor-taking-a-patient-s-blood-pressure-14558560/',
    },
  },
  elderly: {
    src: elderly,
    alt: {
      en: 'Grandparents laughing with their grandchild in the garden',
      ta: 'தோட்டத்தில் பேரக்குழந்தையுடன் சிரிக்கும் தாத்தா பாட்டி',
    },
    credit: {
      author: 'Pexels',
      license: 'Pexels License',
      url: 'https://www.pexels.com/photo/woman-and-man-sitting-with-child-18394079/',
    },
  },
  donate: {
    src: donate,
    alt: {
      en: 'Smiling children standing together in front of a yellow door',
      ta: 'மஞ்சள் கதவின் முன் ஒன்றாக நின்று புன்னகைக்கும் குழந்தைகள்',
    },
    credit: {
      author: 'Pexels',
      license: 'Pexels License',
      url: 'https://www.pexels.com/photo/kids-smiling-at-the-camera-3920704/',
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
