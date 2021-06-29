
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement

// TODO maybe
	// repeat queue or played
	// use virtual DOM for playlist
	// indexedDB instead of localStorage
	// skip silent sections in tracks e.g. leading to hidden tracks.
		// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
		// https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode

// TODO start shuffle play again after e.g. finishing a folder etc.

// TODO gapless playback (surprisingly shitty)

// TODO merge new imports into related folders
	// CONTROLS.fixBreakages()

// TODO save queue as playlist
	// giveFile()

// TODO mark tracks to be played together in groups in specific orders e.g. Hendrix, Bowie etc.
	// track must always be preceded by
	// track must always be followed by
	// not when queued
	// temporary override option

// TODO tags
	// https://taglib.org/api/
	// https://pypi.org/project/pytaglib/
	// https://en.wikipedia.org/wiki/TagLib
	// https://developer.mozilla.org/en-US/docs/WebAssembly
	// https://emscripten.org/docs/getting_started/Tutorial.html
		// shuffle by tag
		// replaygain
		// images
		// scrobbling
			// https://www.last.fm/api/scrobbling

"use strict";

function FromPlaylist() {
	this.get = ( qs, only ) => {
		let arr = arrayFrom( playlist.querySelectorAll( qs ) )
		if ( typeof only === "number" ) {
			return arr[ only ];
		}
		return arr;
	};
	this.tracks = {
		queued: ndx => this.get( 'span[data-queue]:not([data-queue=""])', ndx ),
		notPlayed: ndx => this.get( "ol li:not(.played)", ndx ),
		notBroken: ndx => this.get( "ol li:not(.broken)", ndx ),
		filtered: ndx => this.get( "ol li.filtered", ndx ),
		broken: ndx => this.get( "ol li.broken", ndx ),
		all: ndx => this.get( "ol li", ndx )
	};
	this.folders = {
		notPlayed: ndx => this.get( "li[data-path]:not(.played)", ndx ),
		all: ndx => this.get( "li[data-path]", ndx )
	};
	this.filtered = ndx => this.get( "li.filtered", ndx );
	this.focussed = () => this.get( "li.focussed", 0 );
	this.played = ndx => this.get( "li.played", ndx );
};

let currently_playing_folder,
	currently_playing_track,
	played_index = null,
	playlist_fragment,
	queuend = false,
	track_id = 0,
	played = [],
	queue = [],
	dragee,
	dropee,

	debugging = false;

const playlist_filter = document.getElementById( "playlist_filter" ),
	list_editor = document.getElementById( "list_editor" ),
	playlist = document.getElementById( "playlist" ),
	controls = document.getElementById( "controls" ),
	sources = document.getElementById( "sources" ),
	seek = document.getElementById( "seek" ),
	spp = document.getElementById( "spp" ),

	list_editor_trash = list_editor.querySelector( "div" ),
	list_editor_list = list_editor.querySelector( "ol" ),
	audio = document.querySelector( "audio" ),
	playpen = playlist.parentElement,

	fromPlaylist = new FromPlaylist(),

	collator = new Intl.Collator( undefined, {
		ignorePunctuation: true,
		sensitivity: "base",
		caseFirst: "upper",
		numeric: true
	} ),

	debugMsg = ( where, what, how ) => {
		if ( debugging || how ) {
			console[ how || "log" ]( where, what );
		}
	},

	cloneOf = arr => [].concat( arr ),

	absPath = li => li.dataset.abs_path,

	notPop = arr => arr.slice( -1 )[ 0 ],

	arrayFrom = lst => Array.from( lst ),

	ctrlVlu = ctrl => controls[ ctrl ].value,

	ctrlChckd = ctrl => controls[ ctrl ].checked,

	randNum = n => Math.floor( Math.random() * n ),

	halfPlaypen = () => playpen.offsetHeight * 0.5,

	untilEndOf = cont => isCtrlVlu( "endof", cont ),

	trackIDs = lst => lst.map( li => li.dataset.id ),

	isShuffleBy = sb => isCtrlVlu( "shuffle_by", sb ),

	arrayExistsAndHasLength = arr => arr && arr.length, // TODO deploy at all array.length checks?

	folderPath = li => li ? li.dataset.path : undefined,

	fltrChckd = ctrl => playlist_filter[ ctrl ].checked,

	isCtrlVlu = ( ctrl, vlu ) => ctrlVlu( ctrl ) === vlu,

	folderOfTrack = li => li.parentElement.parentElement,

	isBtn = trg => trg && trg.type && trg.type === "button",

	defaultEndOf = () => controls.endof.value = controls.dataset.endof,

	playingPlayed = () => spp.classList.toggle( "show", played_index ),

	listEditorShowing = () => list_editor.classList.contains( "show" ),

	suchWaw = param => playpen.scrollTop + ( param ? halfPlaypen() : 0 ),

	numberOfNotBrokenTracks = () => fromPlaylist.tracks.notBroken().length,

	listEditingQueue = trg => ( trg || list_editor ).dataset.list === "queue",

	playlistFilterShowing = () => playlist_filter.classList.contains( "show" ),

	multiTrack = ( n, tof ) => `${n} ${tof ? tof : "TRACK"}${n !== 1 ? "S" : ""}`,

	cleanTitle = () => document.title.replace( /^(?:\[(?:PAUS|STOPP)ED\] )+/, "" ),

	trackTitleDataset = listing => listing.querySelector( "span[data-title]" ).dataset,

	idsToTracks = ids => ids.map( id => playlist.querySelector( `li[data-id="${id}"]` ) ),

	folder = li => ( folderPath( li ) ? { "folder": li, "tracks": tracksOfFolder( li ) } : li ),

	showFocussed = ( li, val ) => playpen.scrollBy( 0, li.offsetTop - playpen.offsetTop - val ),

	clearFilters = () => fromPlaylist.filtered().forEach( l => l.classList.remove( "filtered" ) ),

	listMatch = ( dragee, q ) => ( q ? queue : played ).findIndex( li => absPath( li ) === absPath( dragee ) ),

	// TODO maintain "[STOPPED/PAUSED]" prefix if nexting from stopped
	setTitle = ( ttl, pp ) => document.title = ( ttl ? ttl + ( pp ? ` ${cleanTitle()}` : "" ) : cleanTitle() ),

	TRANSPORT = {
		backTrack: () => audio.currentTime = 0,

		nextTrack: prev => {
			let paused = audio.paused;
			TRANSPORT.stopTrack( true );
			if ( !prev && playingPlayed() ) {
				++played_index;
			}
			pausiblyPlay( paused, prev );
		},

		playTrack: prev => {
			selectNext( prev ).then( t => {
				if ( audio.src && audio.paused ) {
					audio.play();
					setTitle();
				}
			} );
		},

		pawsTrack: () => {
			if ( audio.src ) {
				if ( audio.paused ) {
					audio.play();
					setTitle();
				} else {
					audio.pause();
					setTitle( "[PAUSED]", true );
				}
			}
		},

		// TODO "previous" handling is a mess
			// played needs to be all tracks that have been played for at least around 2 seconds?
			// an overide is needed when suffle is off, so rather than previously played, it selects the previous track in the playlist

		prevTrack: () => {
			let pl = played.length;
			if ( pl ) {
				if ( playingPlayed() && Math.abs( played_index ) < pl ) {
					--played_index;
				} else {
					played_index = -1;
				}
			}
			TRANSPORT.nextTrack( true );
		},

		stopTrack: async rs => {
			if ( audio.src ) {
				let fade;
				if ( !rs && audio.volume && ( fade = controls.fade_stop.valueAsNumber ) ) {
					await fadeStop( Math.round( 0.02 * fade ) );
				}
				audio.pause();
				audio.volume = controls.volume.valueAsNumber;
				TRANSPORT.backTrack();
				if ( rs ) {
					audio.removeAttribute( "src" );
				} else {
					setTitle( "[STOPPED]", true );
				}
			}
		},

		prevFolder: () => {
			currently_playing_folder = folderOfTrack( cloneOf( played ).reverse().find( trck => folderOfTrack( trck ) !== currently_playing_folder ) );
			TRANSPORT.nextTrack();
		},

		backFolder: () => {
			currently_playing_track = null;
			TRANSPORT.nextTrack();
		},

		nextFolder: () => {
			currently_playing_folder = null;
			TRANSPORT.nextTrack()
		}
	},

	CONTROLS = {
		fixBreakages: () => debugMsg( "fixBreakages:", fromPlaylist.tracks.broken(), "warn" ),

		stopPlayingPlayed: () => {
			played_index = null;
			if ( confirm( "After this track?" ) ) {
				currently_playing_track = null;
			} else {
				TRANSPORT.nextTrack();
			}
		},

		clearPlayedTracks: () => {
			if ( played.length && confirm( "Clear the play history?" ) ) {
				played = [];
				updatePlayedness();
			}
		},

		playlistFilter: () => {
			if ( numberOfNotBrokenTracks() ) {
				if ( playlist_filter.classList.toggle( "show" ) ) {
					playlist_filter.pff.disabled = false;
					playlist_filter.querySelector( 'input[name="contains"]' ).focus();
					if ( listEditorShowing() ) {
						clickListEditor();
					}
					playlist.classList.add( "filtered" );
					return;
				}
			}
			closePlaylistFilter();
		},

		listEditor: list => { // TODO switch from "queue" to "played" and back
			if ( listEditorShowing() ) {
				clickListEditor();
			} else if ( list.length ) {
				let clone;
				list.forEach( q => {
					clone = q.cloneNode( true );
					clone.draggable = true;
					list_editor_list.append( clone );
				} );
				if ( playlistFilterShowing() ) {
					closePlaylistFilter();
				}
				list_editor.dataset.list = ( list === queue ? "queue" : "played" );
				list_editor.classList.add( "show" );
				list_editor.pff.disabled = false;
				list_editor.done.focus();
			}
		},

		clearPlaylist: () => {
			if ( fromPlaylist.tracks.all().length && confirm( "Clear the playlist?" ) ) {
				TRANSPORT.stopTrack( true );
				setTitle( "KISS My Ears" );
				playlist.innerHTML = "";
				updatePlaylistLength();
				let tds = controls.times.dataset;
				tds.dura = tds.rema = secondsToStr( 0 );
			}
			chrome.storage.local.get( store => {
				if ( arrayExistsAndHasLength( store.paths ) && confirm( "Clear the automatically included tracks?" ) ) {
					queue = [];
					played = [];
					updateQueuetness();
					updatePlayedness();
					chrome.storage.local.remove( "paths" );
					if ( arrayExistsAndHasLength( store.played ) ) {
						chrome.storage.local.remove( "played" );
					}
					if ( arrayExistsAndHasLength( store.queue ) ) {
						chrome.storage.local.remove( "queue" );
					}
				}
				if ( arrayExistsAndHasLength( store.libraries ) && confirm( "Clear the stored libraries?" ) ) {
					chrome.storage.local.remove( "libraries" );
				}
			} );
		}
	},

	sortPlaylist = () => {
		fromPlaylist.folders.all().sort( ( a, b ) => collator.compare( folderPath( a ), folderPath( b ) ) ).forEach( li => playlist.append( li ) );
	},

	setTrackSrc = listing => {
		audio.src = `file:///${absPath( listing )}`;
		displayTrackData( listing );
	},

	shuffleArray = arr => {
		arr.forEach( ( r, i ) => {
			r = randNum( i + 1 );
			[ arr[ i ], arr[ r ] ] = [ arr[ r ], arr[ i ] ];
		} );
	},

	pausiblyPlay = ( paused, prev ) => {
		if ( paused ) {
			selectNext( prev );
		} else {
			TRANSPORT.playTrack( prev );
		}
	},

	addFocussed = fcs => {
		if ( fcs ) {
			if ( !folderPath( fcs ) ) {
				folderOfTrack( fcs ).classList.add( "focussed_folder" );
			}
			fcs.classList.add( "focussed" );
		}
	},

	storageBytesAvailable = () => {
		return new Promise( resolve => {
			chrome.storage.local.getBytesInUse( bytes => {
				resolve( chrome.storage.local.QUOTA_BYTES - bytes ); // TODO sophisticate
			} );
		} );
	},

	removeFocussed = () => {
		let fcs = fromPlaylist.focussed();
		if ( fcs ) {
			if ( !folderPath( fcs ) ) {
				folderOfTrack( fcs ).classList.remove( "focussed_folder" );
			}
			fcs.classList.remove( "focussed" );
			return fcs;
		}
	},

	toggleCollapsed = clck => {
		let cllpsd = ctrlChckd( "collapsed" );
		playlist.classList.toggle( "collapsed", clck ? cllpsd : ( controls.collapsed.checked = !cllpsd ) );
		// TODO if ( cllpsd.checked && a track or folder is focussed ) { scroll to it } else {
		showPlaying();
	},

	setLibraries = libs => {
		if ( libs ) {
			sources.libraries.innerHTML = `<option value="" selected>ADD NEW LIBRARY</option>` +
				libs.map( ( l, i ) => `<option value="${l.lib_path}" title="${l.lib_path}">${l.lib_name}</option>` ).join( "" );
		}
	},

	fadeStop = ms => {
		return new Promise( resolve => {
			let fadeout = setInterval( () => {
				if ( ( audio.volume -= audio.volume / 10 ) < 0.002 ) {
					clearInterval( fadeout );
					audio.volume = 0;
					resolve( true );
				}
			}, ms );
		} );
	},

	updatePlayedness = () => {
		fromPlaylist.played().forEach( li => li.classList.remove( "played" ) );
		controls.played_length.dataset.pl = multiTrack( played.length );
		let fldr;
		played.forEach( li => {
			li.classList.add( "played" );
			fldr = folderOfTrack( li );
			if ( !tracksOfFolder( fldr ).filter( trck => !trck.classList.contains( "played" ) ).length ) {
				fldr.classList.add( "played" );
			}
		} );
	},

	closePlaylistFilter = () => {
		playlist_filter.classList.remove( "show" );
		playlist.classList.remove( "filtered" );
		playlist_filter.pff.disabled = true;
		document.activeElement.blur();
		playlist_filter.reset();
		clearFilters();
		showPlaying();
	},

	tracksOfFolder = ( fldr, trck ) => {
		if ( fldr ) {
			let trcks = arrayFrom( fldr.querySelectorAll( "li" ) );
			if ( arrayExistsAndHasLength( trcks ) ) {
				if ( typeof trck === "number" ) {
					return trcks[ trck ];
				}
				return trcks;
			}
		}
		return [];
	},

	updateQueuetness = () => {
		let ql = queue.length;
		fromPlaylist.tracks.queued().forEach( xq => xq.dataset.queue = "" );
		if ( ql ) {
			queue.forEach( ( q, i ) => trackTitleDataset( q ).queue = ( i + 1 === ql ? ( ql === 1 ? "ONLY" : "LAST" ) : ( !i ? "NEXT" : i + 1 ) ) );
		}
		controls.queue_length.dataset.ql = multiTrack( ql );
	},

	showPlaying = () => {
		if ( currently_playing_track && ctrlChckd( "scrolltoplaying" ) && !fromPlaylist.focussed() ) {
			let cpe = currently_playing_folder,
				offst = playpen.scrollTop;
			if ( !ctrlChckd( "collapsed" ) ) { // TODO isShuffleBy( "folder" )??
			 	offst += halfPlaypen(); // TODO unless currently_playing_track is not visible i.e. long folders
				cpe = currently_playing_track;
			}
			requestIdleCallback( () => showFocussed( cpe, offst ) );
		}
	},

	updatePlaylistLength = () => {
		let btl = fromPlaylist.tracks.broken().length,
			pllds = controls.playlist_length.dataset;
		pllds.folders = multiTrack( fromPlaylist.folders.all().length, "FOLDER" );
		pllds.tracks = multiTrack( numberOfNotBrokenTracks() );
		pllds.broken = ( btl ? ` + ${btl} BROKEN` : "" );
		controls.fixBreakages.classList.toggle( "show", btl ); // TODO CONTROLS.fixBreakages()
	},

	secondsToStr = f => {
		f = parseFloat( f );
		let seconds = f % 60,
			m = ( f - seconds ) / 60,
			minutes = m % 60,
			hours = ( m - minutes ) / 60;
		return [
			( hours ? `${hours}`.padStart( 2, "0" ) : "" ),
			`${minutes}`.padStart( 2, "0" ),
			`${Math.floor( seconds )}`.padStart( 2, "0" )
		].filter( a => a ).join( ":" );
	},

	giveFile = ( name, cntnt ) => {
		let blob = new Blob( [ cntnt ], { type: "text/plain" } ),
			ourl = URL.createObjectURL( blob ),
			a = document.createElement( "a" );
		a.href = ourl;
		a.download = name;
		document.body.append( a );
		a.click();
		a.remove();
		URL.revokeObjectURL( ourl );
	},

	mindYourPsAndQs = store => {
		return new Promise( resolve => {
			if ( store ) {
				let p = store.played,
					q = store.queue;
				if ( arrayExistsAndHasLength( p ) ) {
					played = played.concat( idsToTracks( p ) );
					updatePlayedness();
				}
				if ( arrayExistsAndHasLength( q ) ) {
					queue = queue.concat( idsToTracks( q ) );
					updateQueuetness();
				}
			}
			resolve( true );
		} );
	},

	toggleOptionVisibility = () => {
		if ( ctrlChckd( "shuffle" ) ) {
			controls.classList.remove( "hide_shuffle_by" );
			if ( isShuffleBy( "folder" ) ) {
				controls.classList.remove( "hide_cont_folder" );
			} else {
				controls.classList.add( "hide_cont_folder" );
				if ( untilEndOf( "folder" ) ) {
					defaultEndOf();
				}
			}
		} else {
			controls.classList.add( "hide_shuffle_by" );
			controls.classList.remove( "hide_cont_folder" );
		}
	},

	displayTrackData = listing => {
		if ( currently_playing_track ) {
			currently_playing_track.classList.remove( "playing" );
			if ( currently_playing_folder ) {
				currently_playing_folder.classList.remove( "playing" );
			}
		}
		if ( listing ) {
			currently_playing_folder = folderOfTrack( currently_playing_track = listing );
			currently_playing_folder.classList.add( "playing" );
			listing.classList.add( "playing" );
			setTitle( listing.dataset.title );
			showPlaying();
		} else {
			currently_playing_folder = currently_playing_track = null;
			CONTROLS.clearPlayedTracks();
			setTitle( "KISS My Ears" );
		}
	},

	collectionToHTML = ( folder, end ) => { // TODO use tags to determine fields to create
		if ( folder && arrayExistsAndHasLength( folder.tracks ) ) {
			let ol = document.createElement( "ol" ),
				oli = document.createElement( "li" ),
				li, spn;
			oli.dataset.path = folder.path;
			folder.tracks.sort( ( a, b ) => a.num - b.num ).forEach( track => {
				li = document.createElement( "li" );
				li.dataset.abs_path = track.abspath;
				li.dataset.title = track.title;
				li.dataset.id =  track.id;
				[ ( parseInt( track.num ) || 0 ), track.title, track.type ].forEach( ( disp, i ) => {
					spn = document.createElement( "span" );
					spn.dataset.display = disp;
					if ( i === 1 ) {
						spn.dataset.title = "";
					}
					li.append( spn );
				} );
				ol.append( li );
			} );
			li.dataset.last_track = true;
			oli.append( ol );
			playlist_fragment.append( oli );
			if ( end ) {
				playlist.append( playlist_fragment );
				updatePlaylistLength();
				sortPlaylist();
				showPlaying();
			}
		}
	},

	pathsToPlaylist = ( paths, stored ) => {
		stored = stored || [];
		return new Promise( resolve => {
			if ( arrayExistsAndHasLength( paths ) ) {
				let folder = { "tracks": [], "path": "" },
					mtch, pastpath;
				playlist_fragment = document.createDocumentFragment();
				resolve( stored.concat( paths.filter( path => {
					if ( stored.some( sp => sp.a === path.a ) ) { // TODO reduce paths object size
						return false;
					}
					if ( pastpath !== path.d ) { // TODO reduce paths object size
						pastpath = path.d;
						collectionToHTML( folder );
						folder = { "tracks": [], "path": "" };
					}
					folder.path = path.d; // TODO reduce paths object size
					track_id = Math.max( track_id, path.i );
					if ( mtch = path.f.match( /^([0-9]+)?[ \-_]*(.+)\.([a-z0-9]+)$/ ) ) { // TODO reduce paths object size
						folder.tracks.push( {
							"title": mtch[ 2 ].replace( /_+/g, " " ),
							"abspath": path.a,
							"type": mtch[ 3 ],
							"num": mtch[ 1 ],
							"id": path.i
						} );
						return true;
					}
					debugMsg( "Unprocessable file name format:", path, "warn" ); // TODO what if the folder is empty?
					return false;
				} ) ) );
				collectionToHTML( folder, true );
				if ( !playlist_filter.querySelector( 'input[type="text"]' ) ) { // TODO derive from tags
					let tmplt = document.querySelector( "template" ), guts;
					[ "path", "title" ].forEach( col => {
						guts = tmplt.content.firstElementChild.cloneNode( true );
						guts.firstElementChild.textContent = col.toUpperCase();
						playlist_filter.pff.append( guts );
					} );
				}
			}
		} );
	},

	selectNext = prev => {
		return new Promise( resolve => {
			if ( !audio.src ) {
				let listing,
					pl = played.length;
				if ( pl && playingPlayed() ) {
					listing = played[ pl + played_index ];
				} else {
					played_index = null;
					if ( queue.length ) {
						listing = queue.shift();

						// TODO if stop at the end of track lands here and the player is refreshed, the queue starts again at its next entry
							// a) was_queued = listing? a kind of honorary queue track to be cleared only when the track is ended or skipped
							// b) don't shift the queue here, but do it at track end? sounds complicated

							// at the same time;
								// address the crappy issue of not being able to stop at the end of the queue when the last track of the queue is playing

						queuend = !queue.length;
						if ( listEditorShowing() && listEditingQueue() ) {
							if ( queuend ) {
								clickListEditor();
							} else {
								list_editor.querySelector( "ol li" ).remove();
							}
						}
						updateQueuetness();
					} else {
						let list = fromPlaylist.tracks.notBroken();
						if ( list.length ) {
							if ( ctrlChckd( "shuffle" ) ) {
								if ( isShuffleBy( "folder" ) ) {

									// TODO on startup (assuming we end up here) pick up where we left off
									// currently finds a new folder to start instead of carrying on with the last one, even if there are tracks remaining to play

									if ( currently_playing_folder ) {
										let tof = tracksOfFolder( currently_playing_folder ),
											lstndx = tof.indexOf( currently_playing_track );
										if ( lstndx < tof.length - 1 ) {
											listing = tof[ lstndx + 1 ];
										} else {
											currently_playing_folder.classList.remove( "playing" ); // TODO check this // why doesn't this happen at displayTrackData?
											currently_playing_folder.classList.add( "played" );
										}
									}
									if ( !listing ) {
										if ( ctrlChckd( "skiplayed" ) ) {
											list = fromPlaylist.folders.notPlayed();
										} else {
											list = fromPlaylist.folders.all();
										}
										listing = tracksOfFolder( currently_playing_folder = list[ randNum( list.length ) ], 0 );
									}
								} else {
									if ( ctrlChckd( "skiplayed" ) ) {
										list = fromPlaylist.tracks.notPlayed();
									}
									listing = list[ randNum( list.length ) ];
								}
							} else {
								let lstndx = list.indexOf( currently_playing_track || notPop( played ) );
								listing = list[ ~lstndx ? lstndx + ( prev ? -1 : 1 ) : 0 ];
							}
						}
					}
				}
				if ( listing ) {
					setTrackSrc( listing );
				} else if ( untilEndOf( "world" ) && numberOfNotBrokenTracks() ) {
					// TODO reset all the things
					audio.removeAttribute( "src" );
					displayTrackData();
					TRANSPORT.playTrack();
				}
			}
			resolve( true );
		} );
	},

	/* event functions */

	focusButton = evt => evt.target.blur(),

	dragEnd = () => dragee.classList.remove( "dragee" ),

	seekTrack = evt => audio.currentTime = evt.target.value,

	liFromEvtPath = evt => folder( evt.composedPath().find( e => e.tagName && e.tagName.toLowerCase() === "li" ) ),

	setTrackDuration = () => controls.times.dataset.dura = secondsToStr( seek.control.max = Math.ceil( audio.duration ) ),

	dragStart = evt => {
		debugMsg( "dragStart:", evt );
		evt.dataTransfer.effectAllowed = "move";
		dragee = evt.target;
	},

	trackError = evt => {
		debugMsg( "trackError:", { "evt": evt, "currently_playing_track": currently_playing_track }, "error" );
		currently_playing_track.classList.add( "broken" );
		updatePlaylistLength();
		TRANSPORT.nextTrack();

		// TODO mark folders as broken if all their tracks are?
		// TODO offer to remove or do it automatically and give notice?
			// CONTROLS.fixBreakages()
		// TODO clean up GUI "breakages" button and counter after broken tracks are removed
			// updatePlaylistLength
	},

	dragOver = evt => {
		debugMsg( "dragOver:", evt );
		evt.preventDefault();
		dropee = liFromEvtPath( evt );
		dragee.classList.add( "dragee" );
		evt.dataTransfer.dropEffect = "move";
	},

	contextMenu = evt => {
		debugMsg( "contextMenu:", evt );
		if ( !debugging ) {
			let trg = liFromEvtPath( evt );
			if ( trg ) {
				evt.preventDefault();
				googleSearch( trg );
			}
		}
	},

	trackTimeUpdate = () => {
		let curt = audio.currentTime,
			tds = controls.times.dataset;
		tds.curt = secondsToStr( seek.control.value = curt );
		tds.rema = secondsToStr( ( audio.duration - curt ) || 0 );
	},

	googleSearch = trg => {
		if ( navigator.onLine ) {
			let query = ( trg.folder ? folderPath( trg.folder ) : `${folderPath( folderOfTrack( trg ) )} | ${trg.dataset.title}` );
			// TODO with tags; track search should be "{artist} {title}"
			if ( query && confirm( `Google Web Search:
"${query}"` ) ) {
				chrome.tabs.create( { "url": `https://www.google.com/search?q=${encodeURIComponent( query )}`, "active": true } );
			}
		}
	},

	clickControls = evt => {
		debugMsg( "clickControls:", evt );
		let trg = evt.target;
		if ( isBtn( trg ) ) {
			let fnc = trg.name;
			if ( CONTROLS.hasOwnProperty( fnc ) ) {
				CONTROLS[ fnc ]( fnc === "listEditor" ? ( listEditingQueue( trg ) ? queue : played ) : null );
			} else if ( TRANSPORT.hasOwnProperty( fnc ) ) {
				TRANSPORT[ fnc ]();
			}
		} else if ( trg && /^(range|checkbox|radio)$/.test( trg.type ) ) {
			trg.dataset.clicked = true;
		} else if ( trg === controls.blur_oasis ) {
			evt.preventDefault();
		}
	},

	clickListEditor = evt => { // TODO all playlist click actions in list_editor too?
		debugMsg( "clickListEditor:", evt );
		if ( evt && evt.target.name === "clear" ) {
			if ( listEditingQueue() ) {
				if ( queue.length && confirm( "Clear the queue?" ) ) {
					queue = [];
					updateQueuetness();
				}
			} else if ( played.length && confirm( "Clear played tracks?" ) ) {
				played = [];
				updatePlayedness();
			}
		}
		if ( evt && evt.target && !evt.target.type ) {
			return;
		}
		list_editor.classList.remove( "show" );
		list_editor_list.innerHTML = "";
		list_editor.pff.disabled = true;
	},

	drop = evt => {
		debugMsg( "drop:", evt );
		let q = listEditingQueue();
		if ( dragee.parentElement ) {
			evt.preventDefault();
			let trg = evt.target;
			if ( trg === list_editor_trash ) {
				list_editor_trash.append( dragee );
				( q ? queue : played ).splice( listMatch( dragee, q ), 1 );
				dragee.remove();
			} else if ( q ) {
				let movee = queue.splice( listMatch( dragee, true ), 1 )[ 0 ];
				if ( trg === list_editor_list ) {
					list_editor_list.append( dragee );
					queue.push( movee );
				} else {
					list_editor_list.insertBefore( dragee, dropee );
					queue.splice( listMatch( dropee, true ), 0, movee );
				}
			}
			if ( q ) {
				updateQueuetness();
			} else {
				updatePlayedness();
			}
		}
	},

	trackEnded = () => {
		let cont = true;
		controls.times.dataset.dura = secondsToStr( 0 );
		if ( currently_playing_track ) {
			if ( playingPlayed() ) {
				++played_index;
			} else {
				played.push( currently_playing_track );
				updatePlayedness();
				if ( listEditorShowing() && list_editor.dataset.list === "played" ) {
					list_editor_list.append( currently_playing_track.cloneNode( true ) );
				}
			}
		}
		audio.removeAttribute( "src" );
		if ( queuend && !queue.length && untilEndOf( "queue" ) ) {
			cont = queuend = false;
		} else if ( untilEndOf( "track" ) || ( untilEndOf( "folder" ) && currently_playing_track && currently_playing_track.dataset.last_track ) ) {
			cont = false;
		}
		if ( cont ) {
			TRANSPORT.playTrack();
		} else {
			selectNext().then( t => {
				setTitle( "[STOPPED]", true );
				defaultEndOf();
			} );
		}
	},

	inputPlaylistFilter = evt => { // TODO collapsed....?
		debugMsg( "inputPlaylistFilter:", evt );
		let fltrs = arrayFrom( playlist_filter.querySelectorAll( 'input[type="text"]' ) ).filter( f => f.value );
		if ( fltrs.length ) {
			let fresh = ( fltrChckd( "onlyunplayed" ) ? ":not(.played)" : "" ), // TODO skiplayed?
				insens = ( fltrChckd( "casensitive" ) ? "" : " i" ), tag, mth,
				fltr = fltrs.map( npt => {
					tag = npt.parentElement.querySelector( "legend" ).textContent.toLowerCase();
					mth = { "starts": "^", "contains": "*", "ends": "$" }[ npt.name ];
					return `li[data-${tag}${mth}="${npt.value}"${insens}]:not(.broken)${fresh}`;
				} ).join( fltrChckd( "combifilter" ) ? " " : "," );
			// TODO console.log( fltr ); // combifilter won't work like this for more fields/tags
			clearFilters();
			playlist.querySelectorAll( fltr ).forEach( li => {
				li.classList.add( "filtered" );
				if ( !folderPath( li ) ) {
					folderOfTrack( li ).classList.add( "filtered" );
				} else {
					li.querySelectorAll( `li${fresh}` ).forEach( li => li.classList.add( "filtered" ) );
				}
			} );
		} else {
			clearFilters();
		}
	},

	inputControls = evt => {
		debugMsg( "inputControls:", evt );
		let trg = evt.target,
			typ = trg.type;
		if ( typ ) {
			let vlu = trg.value,
				nme = trg.name;
			if ( typ === "range" ) {
				vlu = parseFloat( vlu );
				if ( trg.name === "volume" ) {
					audio.volume = vlu;
				} else {
					vlu /= 1000;
				}
				trg.parentElement.dataset.op = vlu;
			} else {
				if ( typ === "checkbox" ) {
					if ( nme === "scrolltoplaying" ) {
						removeFocussed();
						showPlaying();
					} else if ( nme === "collapsed" ) {
						toggleCollapsed( true );
					}
				} else if ( typ === "radio" ) {
					if ( nme === "endof" && ( vlu === "world" || vlu === "list" ) ) {
						controls.dataset.endof = vlu;
					}
				}
				toggleOptionVisibility();
			}
			if ( trg.dataset.clicked ) {
				trg.dataset.clicked = "";
				trg.blur();
			}
		}
	},

	clickPlaylistFilter = evt => {
		debugMsg( "clickPlaylistFilter:", evt );
		let trg = evt.target;
		if ( isBtn( trg ) ) {
			let nme = trg.name;
			if ( nme === "done" ) {
				closePlaylistFilter();
			} else if ( nme === "toqueue" ) {
				let fltrd = fromPlaylist.tracks.filtered(),
					lessqueued = fltrd.filter( f => !trackTitleDataset( f ).queue ),
					shuffle = false;
				if ( fltrd.length > lessqueued.length && confirm( "Exclude tracks already in the queue?" ) ) {
					fltrd = lessqueued;
				}
				if ( fltrd.length > 1 ) {

					// TODO always append or follow ctrlVlu( "clicky" )?
					// TODO offer shuffle by folder
					// TODO skiplayed?

					if ( confirm( "Shuffle tracks before appending to the queue?" ) ) {
						shuffleArray( fltrd );
					} else if ( queue.length ) {
						shuffle = confirm( "Shuffle the entire resultant queue?" );
					}
				}
				if ( !fltrd.length ) return;
				if ( isCtrlVlu( "clicky", "delist" ) ) {
					// TODO delisting which?
				} else {
					if ( isCtrlVlu( "clicky", "end" ) ) {
						queue = queue.concat( fltrd );
					} else {
						queue = fltrd.concat( queue );
					}
				}
				if ( shuffle ) {
					shuffleArray( queue );
				}
				updateQueuetness();
			}
		}
	},

	keyDown = evt => {
		debugMsg( "keyDown:", { "evt": evt, "key": evt.key } );
		let k = evt.key,
			arrw = /^Arrow/.test( k );
		if ( !listEditorShowing() && !playlistFilterShowing() && /^(Arrow|Page)(Up|Down)$/.test( k ) ) {
			// TODO make it work with filtered and listEditor
			let fcs = removeFocussed(),
				up = /Up$/.test( k );
			evt.preventDefault();
			if ( arrw && ctrlChckd( "collapsed" ) ) {
				let es = `${up ? "previous" : "next" }ElementSibling`;
				if ( fcs ) {
					if ( folderPath( fcs ) ) {
						if ( up ) {
							fcs = notPop( tracksOfFolder( fcs ) );
						} else {
							fcs = tracksOfFolder( fcs, 0 );
						}
					} else {
						fcs = fcs[ es ] || folderOfTrack( fcs )[ es ];
					}
				} else if ( currently_playing_track ) { // TODO ignore currently playing; find the nearest folder and grab the first track
					if ( !( fcs = currently_playing_track[ es ] ) ) {
						fcs = folderOfTrack( currently_playing_track );
						if ( !up ) {
							fcs = fcs.nextElementSibling;
						}
					}
				} else {
					// TODO fcs = the nearest folder
				}
				if ( fcs ) {
					/* the order of these operations matters */
					addFocussed( fcs );
					showFocussed( fcs, suchWaw( !folderPath( fcs ) ) );
				}
			} else {
				let all = fromPlaylist[ arrw ? "tracks" : "folders" ].all(),
				waw = suchWaw( arrw );
				fcs = fcs || cloneOf( all ).sort( ( a, b ) => ( a.offsetTop - waw ) + ( b.offsetTop - waw ) )[ 0 ];
				if ( fcs ) {
					if ( arrw && folderPath( fcs ) ) {
						if ( up ) {
							fcs = notPop( tracksOfFolder( fcs.previousElementSibling ) );
						} else {
							fcs = tracksOfFolder( fcs, 0 );
						}
					} else if ( !arrw && !folderPath( fcs ) ) {
						if ( up ) {
							fcs = folderOfTrack( fcs );
						} else {
							fcs = folderOfTrack( fcs ).nextElementSibling;
						}
					} else {
						fcs = all[ all.indexOf( fcs ) + ( up ? -1 : 1 ) ];
					}
				}
				if ( fcs ) {
					/* the order of these operations matters */
					showFocussed( fcs, waw );
					addFocussed( fcs );
				}
			}
		} else if ( !/^(input|select)$/i.test( evt.target.tagName ) ) { // document.activeElement
			if ( arrw ) {
				let right = /Right$/.test( k ),
					left = /Left$/.test( k );
				evt.preventDefault();
				if ( isShuffleBy( "folder" ) && evt.ctrlKey ) {
					if ( left ) {
						if ( evt.altKey ) {
							TRANSPORT.backFolder();
						} else {
							TRANSPORT.prevFolder();
						}
					} else if ( right ) {
						TRANSPORT.nextFolder();
					}
				} else {
					if ( left ) {
						if ( evt.altKey ) {
							TRANSPORT.backTrack();
						} else {
							TRANSPORT.prevTrack();
						}
					} else if ( right ) {
						TRANSPORT.nextTrack();
					}
				}
			} else if ( evt.ctrlKey && k === "f" ) {
				evt.preventDefault();
				CONTROLS.playlistFilter();
			} else {
				switch ( k ) {
					case "k":
					case " ": {
						TRANSPORT.pawsTrack();
						break;
					}
					case "s": {
						TRANSPORT.stopTrack();
						break;
					}
					case "c": {
						toggleCollapsed();
						break;
					}
					case "q": {
						CONTROLS.listEditor( queue );
						break;
					}
					case "p": {
						if ( evt.altKey && playingPlayed() ) {
							evt.preventDefault();
							CONTROLS.stopPlayingPlayed();
						} else {
							CONTROLS.listEditor( played );
						}
						break;
					}
					case "g": {
						let fcs = fromPlaylist.focussed();
						if ( fcs ) {
							googleSearch( folder( fcs ) );
						}
						break;
					}
					case "Enter": {
						let fcs = fromPlaylist.focussed();
						if ( fcs ) {
							clickPlaylist( { "trg": folder( fcs ), "ctrlKey": evt.ctrlKey, "metaKey": evt.metaKey, "altKey": evt.altKey } );
						}
						break;
					}
					case "Escape": {
						evt.preventDefault();
						removeFocussed();
						showPlaying();
						break;
					}
				}
			}
		}
	},

	importFiles = evt => {
		debugMsg( "importFiles:", evt );
		let slv = String.raw`${sources.libraries.value}`,
			libnme = sources.lib_name.value,
			libpth = sources.lib_path.value,
			trg = evt.target;
		if ( slv ) {
			sources.lib_name.value = sources.lib_path.value = "";
			sources.include.disabled = false;
			sources.new_lib.disabled = true;
		} else {
			sources.new_lib.disabled = false;
			sources.include.disabled = !( libnme && libpth );
		}
		if ( trg === sources.include ) {
			if ( slv ) { // TODO validate pathiness
				libnme = sources.libraries.querySelectorAll( "option" )[ sources.libraries.selectedIndex ].textContent;
			} else {
				slv = String.raw`${sources.lib_path.value}`;
			}
			let sp = slv.split( /\\|\//g ).filter( f => f ),
				paths = arrayFrom( trg.files ).filter( file => /^audio\//.test( file.type ) ).map( file => {
					let cp = sp.concat( file.webkitRelativePath.split( "/" ).filter( f => f ) );
					// TODO sortPlaylist() goes wonky if there's a mix of relative sources
						// only sensibly fixable with "album" recognition via tags?
						// possible dissection of the absolute file path to establish where it could fit might work
					return {
						"a": cp.map( pp => encodeURIComponent( pp ) ).join( "/" ), // TODO reduce paths object size
						"f": cp.pop(),
						"d": cp.slice( sp.length ).join( " | " ),
						"i": ++track_id
					};
				} );
			if ( paths.length ) {
				chrome.storage.local.get( async store => {
					paths = await pathsToPlaylist( paths, store.paths );
					if ( paths.length ) { // TODO only if something new is actually being added
						// TODO offer to store even if all the paths were already included in playlist
						// TODO provide some kind of progress indicator
						TRANSPORT.playTrack();
						if ( confirm( "Remember these files for automatic inclusion in future?" ) ) {
							let nl = { "lib_path": slv, "lib_name": libnme },
								libraries = ( store.libraries || [] ).filter( l => l.lib_path !== nl.lib_path ).concat( [ nl ] );
							setLibraries( libraries );
							chrome.storage.local.set( { "libraries": libraries, "paths": paths } );
							// TODO storageBytesAvailable() || giveFile()
								// JSON.stringify etc.
						}
					}
				} );
			}
			sources.reset();
			sources.new_lib.disabled = false;
			sources.include.disabled = true;
		}
	},

	clickPlaylist = evt => {

		// TODO all playlist click actions in list_editor too?

		debugMsg( "clickPlaylist:", evt );
		let trg = ( evt.trg || liFromEvtPath( evt ) ); // TODO if ctrlChckd( "collapsed" ) clicking a folder expands it
		if ( trg ) {
			let cv = ctrlVlu( "clicky" ),
				ctrl = evt.ctrlKey,
				meta = evt.metaKey,
				tia = trg.tracks,
				alt = evt.altKey;
			if ( ctrl || alt ) {
				if ( ctrl ) {
					cv = "now";
					if ( alt ) {
						cv = "end";
					} else if ( meta ) {
						cv = "next";
					}
				} else if ( meta && alt ) {
					cv = "delist";
				}
			}
			if ( tia ) {
				queue = queue.filter( li => !~trg.tracks.indexOf( li ) );
			} else {
				let qp = queue.indexOf( trg );
				if ( ~qp ) {
					queue.splice( qp, 1 );
				}
			}

			// TODO if ( controls.shuffle etc ) offer to shuffle before adding folders to the queue?
			// TODO if ( a queued track has been delisted ) make sure the further options are clearly indicated as not required
			// TODO I don't like delist...

			if ( cv === "delist" ) {
				if ( confirm( `Remove this ${tia ? "folder" : "track"} from the playlist?` ) ) {
					if ( confirm( "Do not automatically include in future?" ) ) {
						chrome.storage.local.get( store => {
							chrome.storage.local.set( { "paths": store.paths.filter( sp => {
								return ( tia ? !trg.tracks.some( li => sp.a === absPath( li ) ) : sp.a !== absPath( trg ) ); // TODO reduce paths object size
							} ) } );
						} );
					}
					if ( ( tia && ~trg.tracks.indexOf( currently_playing_track ) ) || trg === currently_playing_track ) {
						TRANSPORT.nextTrack();
					}
					if ( tia ) {
						played = played.filter( li => !~trg.tracks.indexOf( li ) );
						trg.folder.remove();
					} else {
						played = played.filter( li => li !== trg );
						trg.remove();
					}
					updatePlaylistLength();
					updatePlayedness();
				}
			} else if ( cv === "now" ) {
				if ( !tia && trg === currently_playing_track ) {
					TRANSPORT.backTrack();
					return;
				}
				if ( tia ) {
					queue = trg.tracks.concat( queue );
				} else {
					queue.unshift( trg );
				}
				TRANSPORT.nextTrack(); // TODO play immediately doesn't if the player is stopped
			} else {
				if ( cv === "next" ) {
					if ( tia ) {
						queue = trg.tracks.concat( queue );
					} else {
						queue.unshift( trg );
					}
				} else if ( cv === "end" ) {
					if ( tia ) {
						queue = queue.concat( trg.tracks );
					} else {
						queue.push( trg );
					}
				}
			}
			updateQueuetness();
		}
	},

	storeSettings = () => {
		chrome.storage.local.set( {
			"played": trackIDs( played ),
			"queue": trackIDs( queue ),
			"settings": {
				scrolltoplaying: ctrlChckd( "scrolltoplaying" ),
				fadestop: controls.fade_stop.valueAsNumber,
				volume: controls.volume.valueAsNumber,
				collapsed: ctrlChckd( "collapsed" ),
				skiplayed: ctrlChckd( "skiplayed" ),
				shuffleby: ctrlVlu( "shuffle_by" ),
				shuffle: ctrlChckd( "shuffle" ),
				endof: controls.dataset.endof,
				clicky: ctrlVlu( "clicky" )
			}
		} );
	},

	applySettings = settings => {
		return new Promise( resolve => {
			let sttngs = Object.assign( {
				scrolltoplaying: true,
				shuffleby: "track",
				collapsed: true,
				skiplayed: true,
				endof: "world",
				shuffle: true,
				clicky: "end",
				fadestop: 0,
				volume: 0.5
			}, settings || {} );
			controls.fade_stop.parentElement.dataset.op = ( controls.fade_stop.value = sttngs.fadestop ) / 1000;
			audio.volume = controls.volume.value = controls.volume.parentElement.dataset.op = sttngs.volume;
			playlist.classList.toggle( "collapsed", controls.collapsed.checked = sttngs.collapsed );
			controls.dataset.endof = controls.endof.value = sttngs.endof;
			controls.scrolltoplaying.checked = sttngs.scrolltoplaying;
			controls.skiplayed.checked = sttngs.skiplayed;
			controls.shuffle_by.value = sttngs.shuffleby;
			controls.shuffle.checked = sttngs.shuffle;
			controls.clicky.value = sttngs.clicky;
			toggleOptionVisibility();
			resolve( true );
		} );
	};

window.addEventListener( "keydown", keyDown );
window.addEventListener( "beforeunload", storeSettings, { passive: true } );

audio.addEventListener( "error", trackError, { passive: true } );
audio.addEventListener( "ended", trackEnded, { passive: true } );
audio.addEventListener( "timeupdate", trackTimeUpdate, { passive: true } );
audio.addEventListener( "loadedmetadata", setTrackDuration, { passive: true } );

sources.addEventListener( "input", importFiles, { passive: true } );

controls.addEventListener( "input", inputControls, { passive: true } );
controls.addEventListener( "click", clickControls );

seek.addEventListener( "input", seekTrack, { passive: true } );

playlist.addEventListener( "contextmenu", contextMenu );
playlist.addEventListener( "click", clickPlaylist, { passive: true } );

playlist_filter.addEventListener( "input", inputPlaylistFilter, { passive: true } );
playlist_filter.addEventListener( "click", clickPlaylistFilter, { passive: true } );

list_editor.addEventListener( "click", clickListEditor, { passive: true } );
list_editor.addEventListener( "dragstart", dragStart, { passive: true } );
list_editor.addEventListener( "dragend", dragEnd, { passive: true } );
list_editor.querySelectorAll( ".dropzone" ).forEach( dz => {
	dz.addEventListener( "dragover", dragOver );
	dz.addEventListener( "drop", drop );
} );

chrome.storage.local.get( store => {
	setLibraries( store.libraries );
	applySettings( store.settings ).then( t => {
		pathsToPlaylist( store.paths ).then( t => {
			mindYourPsAndQs( store ).then( t => {
				TRANSPORT.playTrack();
			} );
		} );
	} );
} );
