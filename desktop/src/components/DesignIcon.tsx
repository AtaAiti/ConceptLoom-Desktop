const assets = import.meta.glob('../assets/capybara/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const dark = {
  imgLayers: 'ee84f.svg',
  imgMinus: '1eaca.svg',
  imgSquare: '398f4.svg',
  imgX: 'a8a08.svg',
  imgWaypoints: '1c5ab.svg',
  imgPanelsTopLeft: '5af52.svg',
  imgChevronsUpDown: '43ba3.svg',
  imgHouse: '9447e.svg',
  imgSun: '9bea4.svg',
  imgPanelsTopLeft1: '15c43.svg',
  imgLayers2: '8be8d.svg',
  imgFiles: '5bc3f.svg',
  imgRoute: '4d08e.svg',
  imgNetwork: '9a110.svg',
  imgSparkles: 'b0330.svg',
  imgGraduationCap: '2c224.svg',
  imgShieldCheck: '7bd06.svg',
  imgSettings2: 'f7d49.svg',
  imgChevronRight: '69efa.svg',
  imgSearch: '06908.svg',
  imgMoon: '28c93.svg',
  imgPlus: '59b62.svg',
  imgArrowRight: '4caf0.svg',
  imgDatabase: 'f0052.svg',
  imgArrowUpRight: '01296.svg',
  imgLanguages: '5ba74.svg',
  imgBraces: 'fd125.svg',
  imgCircleCheck: 'e87a2.svg',
  imgFilePlus2: 'a2063.svg',
  imgShieldCheck1: 'bc4bf.svg',
  imgPlay: '40c03.svg',
  imgSlidersHorizontal: '374f8.svg',
  imgLayers3: 'c604a.svg',
  imgNetwork1: 'df7ab.svg',
  imgGitPullRequest: '30427.svg',
  imgListChecks: '2b3b7.svg',
  imgFolder: '00d33.svg',
  imgHardDrive: 'f3e19.svg',
  imgFlag: '4064d.svg',
  imgCircleDot: 'afe5f.svg',
  imgLockKeyhole: '57f62.svg',
  imgBrain: '4e6dd.svg',
  imgArrowLeft: '0f16a.svg',
} as const;
const light: Partial<Record<keyof typeof dark, string>> = {
  imgLayers: 'c0cd2.svg',
  imgMinus: '11fab.svg',
  imgSquare: 'fefb6.svg',
  imgX: '98fd5.svg',
  imgWaypoints: '8c142.svg',
  imgDatabase: '8207c.svg',
  imgChevronsUpDown: '8c0c9.svg',
  imgHouse: '2d314.svg',
  imgSun: 'c988a.svg',
  imgPanelsTopLeft: '4db77.svg',
  imgPanelsTopLeft1: '4db77.svg',
  imgLayers2: 'd7013.svg',
  imgFiles: 'cba5d.svg',
  imgRoute: '4fa53.svg',
  imgNetwork: 'e9df1.svg',
  imgSparkles: 'f6c6d.svg',
  imgGraduationCap: '64dd6.svg',
  imgShieldCheck: 'c89ca.svg',
  imgSettings2: '5ca3b.svg',
  imgChevronRight: '03b9e.svg',
  imgSearch: '65d83.svg',
  imgMoon: '42369.svg',
  imgSlidersHorizontal: '5abc6.svg',
  imgLayers3: '2e3af.svg',
  imgNetwork1: 'bb371.svg',
  imgGitPullRequest: '78e69.svg',
  imgListChecks: '0c9b9.svg',
  imgPlay: 'af080.svg',
};
export type DesignIconName = keyof typeof dark;
const selectedIcons: Partial<Record<DesignIconName, string>> = {
  imgHouse: '26543.svg',
  imgSun: '00458.svg',
  imgFiles: 'e78b4.svg',
  imgRoute: '51dc0.svg',
  imgNetwork: 'df7ab.svg',
  imgSparkles: '6c3a8.svg',
  imgGraduationCap: 'd9da7.svg',
};
export function DesignIcon({ name, active = false }: { name: DesignIconName; active?: boolean }) {
  return (
    <span className={`design-icon ${active ? 'accent-icon' : ''}`} aria-hidden="true">
      <img
        className="icon-dark"
        src={
          assets[
            '../assets/capybara/' + (active ? (selectedIcons[name] ?? dark[name]) : dark[name])
          ]
        }
        alt=""
      />
      <img
        className="icon-light"
        src={assets['../assets/capybara/' + (light[name] ?? dark[name])]}
        alt=""
      />
    </span>
  );
}
