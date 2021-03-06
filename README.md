# KISSMyEars

"[Keep It Stupid Simple](https://en.wikipedia.org/wiki/KISS_principle)" local audio file player Chrome extension, **CURRENTLY IN ALPHA DEVELOPMENT** and likely to contain much incomplete or flat out broken code and functionality.

## Why?
Having tried many local music players, on Windoze and Linux, I have frequently been confused, frustrated and disappointed. Entire forums have been dedicated to assisting users of these players in operating them. I just want to play my music archive in *all the most reasonably expected ways*; press "go" and music happens :)

## Premise
 * I am using a PC, unsurprisingly already have a web browser installed and it's open practically all the time
 * I have my music archive ripped and stored on my PC in directories
 * I want to play those files in specific orders or shuffled
 * I don't want my music player to:
   * require the internet or alter my files at all
   * have so many optional extra features that it requires an online wiki or forum to comprehend
   * utilise deep learning AI, and via a wet wired BCI, examine my mood and make selections it deems suitable

With this premise in mind, I am working to build a Chrome web browser extension that provides **only** the features I **need** and presents them in a one stop control panel. It currently looks like this:

![kme-screenshot](https://user-images.githubusercontent.com/3055947/124341320-654b6180-dbb3-11eb-927f-1da0fdf302b8.png)


## Development
I haven't even finished building it yet and it's already, by far, the most satisfying music player I have used, but there is still a lot of coding to do. This is my primary, nay, only music player, and there's no better way to assess the usability than by actually using it, so every day I tinker with ideas and bugs. Speaking as an alpha user, it's coming along nicely :)

Feel free to try it out as an unpackaged extension while I work on it, and I will publish it on the Chrome Web Store when it's in a fit state for simpler installation.

### TODO
The code is a hodgepodge of kluges and half-cocked ideas expressed in accordance with the philosophy "make it work, then make it pretty". There are notes throughout the code marked as `TODO`; some make more sense than others ;)

The most important next step to take is integrating the ability to read files' id3 and other similar tags such as Vorbis Comments; I plan to do this using [WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly) and [TagLib](https://en.wikipedia.org/wiki/TagLib), but frankly dunno if that will work yet, so may need an alternative; time will tell. Reading tags will have a huge positive effect on the quality of the UX and code efficiency.
