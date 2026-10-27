# Artwork provenance

Local fan theme, not an official DeepSeek, DSH, or Genshin Impact product. Character and game artwork belong to HoYoverse / miHoYo.

Original source code and documentation are MIT-licensed; see [LICENSE](LICENSE). Third-party game artwork, logos and trademarks are **excluded** from that license. In particular, the bitmap embedded in `skandha-symbol.svg` remains third-party artwork; wrapping it in SVG does not change its ownership. These exclusions also apply when artwork is embedded in `dist/client.js` or visible in screenshots. No general redistribution or commercial-use permission for those materials is granted here.

Delivery assets, obtained on 2026-10-27:

- `nahida.webp`: [official Nahida illustration](https://act-webstatic.hoyoverse.com/upload/contentweb/2022/10/26/fe684624008db25ac4b44ea4704f9ba0_3756826627935711351.png), resized to 1100 px wide with alpha.
- `maya-game-background.webp`: [Nahida namecard background](https://genshin-impact.fandom.com/wiki/File:Namecard_Background_Nahida_Crescent.png). This is the actual namecard illustration of the Shrine of Maya, not a 3D gameplay screenshot.
- `nahida-namecard.webp`: [Enka namecard copy](https://enka.network/ui/UI_NameCardPic_Nahida_P.png), used in the theme settings card.
- `skandha-game.png`: [Seeds of Skandha game sticker](https://genshin-impact.fandom.com/wiki/File:PSE_Sticker_Seeds_of_Skandha.png). The image host may deliver WebP bytes despite the URL extension.
- `skandha-symbol.svg`: the same game sticker embedded in a cropped SVG viewport for small controls.
- `sumeru-vision.webp`: [Sumeru Vision](https://genshin-impact.fandom.com/wiki/File:Item_Sumeru_Vision.png), its left half shown through CSS.
- `dendro-seed.svg`: locally authored small UI illustration based on [Dendrogranum](https://genshin-impact.fandom.com/wiki/File:Dendrogranum.png).

The background crops proportionally with CSS `cover`. Positioning and fades use CSS; the character was not repainted. Assets are embedded in the plugin client, with no runtime network requests.

The screenshots under `docs/screenshots/` show an isolated DSH test profile with no personal sessions or account data. Their UI logos and game imagery retain their respective owners' rights.

If you maintain a fork, preserve this notice and verify the rights relevant to your use of the game artwork. Rights holders can contact the maintainer through the repository to request a correction or removal.
