
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement

// TODO maybe
	// desktop notifications
	// repeat queue or played
	// player controls popout
	// use virtual DOM for playlist

// TODO start shuffle play again after e.g. finishing a folder etc.

// TODO gapless playback (surprisingly shitty)

// TODO merge new imports into related folders
	// CONTROLS.fixBreakages()

// TODO save queue as playlist
		// giveFile()

// TODO mark tracks to be played together in groups in specific orders e.g. Hendrix, Bowie etc.
	// track must always be preceded by
	// track must always be followed by
	// temporary override option

// TODO tags
	// https://taglib.org/api/
	// https://pypi.org/project/pytaglib/
	// https://en.wikipedia.org/wiki/TagLib
	// https://developer.mozilla.org/en-US/docs/WebAssembly
		// shuffle by tag
		// replaygain
		// images :(
		// scrobbling :(
			// https://www.last.fm/api/scrobbling

// TODO skip silent sections in tracks e.g. leading to hidden tracks.
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
// https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode

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
	playlist_fragment,
	played_index = 0,
	queuend = false,
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

	list_editor_trash = list_editor.querySelector( "div" ),
	list_editor_list = list_editor.querySelector( "ol" ),
	blur_oasis = controls.querySelector( "button" ),
	audio = document.querySelector( "audio" ),
	playpen = playlist.parentElement,

	fromPlaylist = new FromPlaylist(),

	collator = new Intl.Collator( undefined, {
		ignorePunctuation: true,
		sensitivity: "base",
		caseFirst: "upper",
		numeric: true
	} ),

	absPath = li => li.dataset.abs_path,

	notPop = arr => arr.slice( -1 )[ 0 ],

	arrayFrom = lst => Array.from( lst ),

	ctrlVlu = ctrl => controls[ ctrl ].value,

	ctrlChckd = ctrl => controls[ ctrl ].checked,

	halfPlaypen = () => playpen.offsetHeight * 0.5,

	untilEndOf = cont => isCtrlVlu( "endof", cont ),

	isShuffleBy = sb => isCtrlVlu( "shuffle_by", sb ),

	folderPath = li => li ? li.dataset.path : undefined,

	fltrChckd = ctrl => playlist_filter[ ctrl ].checked,

	isCtrlVlu = ( ctrl, vlu ) => ctrlVlu( ctrl ) === vlu,

	folderOfTrack = li => li.parentElement.parentElement,

	isBtn = trg => trg && trg.type && trg.type === "button",

	listEditorShowing = () => list_editor.classList.contains( "show" ),

	defaultEndOf = () => controls.endof.value = controls.dataset.endof,

	suchWaw = param => playpen.scrollTop + ( param ? halfPlaypen() : 0 ),

	numberOfNotBrokenTracks = () => fromPlaylist.tracks.notBroken().length,

	playlistFilterShowing = () => playlist_filter.classList.contains( "show" ),

	multiTrack = ( n, tof ) => `${n} ${tof ? tof : "TRACK"}${n !== 1 ? "S" : ""}`,

	cleanTitle = () => document.title.replace( /^(?:\[(?:PAUS|STOPP)ED\] )+/, "" ),

	trackTitleDataset = listing => listing.querySelector( "span[data-title]" ).dataset,

	folder = li => ( folderPath( li ) ? { "folder": li, "tracks": tracksOfFolder( li ) } : li ),

	showFocussed = ( li, val ) => playpen.scrollBy( 0, li.offsetTop - playpen.offsetTop - val ),

	clearFilters = () => fromPlaylist.filtered().forEach( l => l.classList.remove( "filtered" ) ),

	pathsToTracks = paths => paths.map( p => playlist.querySelector( `li[data-abs_path="${p}"]` ) ),

	listMatch = ( dragee, q ) => ( q ? queue : played ).findIndex( li => absPath( li ) === absPath( dragee ) ),

	// TODO maintain "[STOPPED/PAUSED]" prefix if nexting from stopped
	setTitle = ( ttl, pp ) => document.title = ( ttl ? ttl + ( pp ? ` ${cleanTitle()}` : "" ) : cleanTitle() ),

	TRANSPORT = {
		backTrack: () => audio.currentTime = 0,

		nextTrack: prev => {
			let paused = audio.paused;
			TRANSPORT.stopTrack( true );
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

		stopTrack: async rs => {
			if ( audio.src ) {
				let fade, vol;
				if ( !rs && ( fade = controls.fade_stop.valueAsNumber ) && ( vol = audio.volume ) ) {
					await fadeStop( fade /= 10, vol / fade );
				}
				audio.pause();
				TRANSPORT.backTrack();
				if ( rs ) {
					audio.removeAttribute( "src" );
				} else {
					setTitle( "[STOPPED]", true );
				}
			}
		},

		// TODO "previous" handling is a mess
			// played needs to be all tracks that have been played for at least around 2 seconds
			// an overide is needed so rather than previously played, it selects the previous track in the playlist

		prevTrack: () => {
			let pl = played.length;
			if ( pl ) {
				if ( Math.abs( played_index ) < pl ) {
					let paused = audio.paused,
						listing = played[ pl + --played_index ];
					TRANSPORT.stopTrack( true );
					setTrackSrc( listing );
					pausiblyPlay( paused );
				}
			} else {
				TRANSPORT.nextTrack( true );
			}
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
		fixBreakages: () => console.warn( "fixBreakages", fromPlaylist.tracks.broken() ),

		clearPlayedTracks: () => {
			if ( played.length && confirm( "Clear the play history?" ) ) {
				played = [];
				updatePlayedness();
			}
		},

		playlistFilter: () => {
			if ( numberOfNotBrokenTracks() ) {
				if ( playlist_filter.classList.toggle( "show" ) ) {
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

		listEditor: list => {
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
			}
		},

		clearPlaylist: () => {
			if ( fromPlaylist.tracks.all().length && confirm( "Clear the playlist?" ) ) {
				let tds = controls.times.dataset;
				TRANSPORT.stopTrack( true );
				setTitle( "KISS My Ears" );
				playlist.innerHTML = "";
				updatePlaylistLength();
				tds.dura = tds.rema = secondsToStr( 0 );
			}
			chrome.storage.local.get( store => {
				if ( store.paths && store.paths.length && confirm( "Clear the automatically included tracks?" ) ) {
					chrome.storage.local.remove( "paths" );
				}
				if ( store.libraries && store.libraries.length && confirm( "Clear the stored libraries?" ) ) {
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

	toggleLibraryVisibility = tog => {
		sources.new_lib.classList.toggle( "hide", tog );
		sources.name.value = sources.path.value = "";
	},

	randNum = n => {
		let u32a = new Uint32Array( 1 );
		crypto.getRandomValues( u32a );
		return Math.floor( u32a / 65536 / 65536 * n );
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

	setLibraries = libs => {
		if ( libs ) {
			sources.libraries.innerHTML = `<option value="" selected>ADD NEW LIBRARY</option>` +
				libs.map( ( l, i ) => `<option value="${l.path}" title="${l.path}">${l.name}</option>` ).join( "" );
		}
	},

	toggleCollapsed = clck => {
		let cllpsd = controls.collapsed;
		playlist.classList.toggle( "collapsed", clck ? cllpsd.checked : ( cllpsd.checked = !cllpsd.checked ) );
		// TODO if ( cllpsd.checked && a track or folder is focussed ) { scroll to it } else {
		showPlaying();
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
		document.activeElement.blur();
		playlist_filter.reset();
		clearFilters();
		showPlaying();
	},

	tracksOfFolder = ( fldr, trck ) => {
		if ( fldr ) {
			let trcks = arrayFrom( fldr.querySelectorAll( "li" ) );
			if ( trcks && trcks.length ) {
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

	fadeStop = ( fade, vol ) => { // TODO yikes
		return new Promise( resolve => {
			while ( fade ) {
				setTimeout( () => {
					try {
						audio.volume -= vol;
					} catch( err ) {
						audio.volume = 0;
					}
					if ( audio.volume < vol ) {
						audio.volume = controls.volume.valueAsNumber;
						resolve( true );
					}
				}, fade * 10 );
				--fade;
			}
		} );
	},

	applyStoredArrays = store => {
		return new Promise( resolve => {
			if ( store ) {
				let p = store.played,
					q = store.queue;
				if ( p && p.length ) {
					played = played.concat( pathsToTracks( p ) );
					updatePlayedness();
				}
				if ( q && q.length ) {
					queue = queue.concat( pathsToTracks( q ) );
					updateQueuetness();
				}
			}
			resolve( true );
		} );
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

	collectionToHTML = ( folder, end ) => { // TODO use tags to determine fields to create
		if ( folder && folder.tracks && folder.tracks.length ) {
			let ol = document.createElement( "ol" ),
				oli = document.createElement( "li" ),
				li, spn;
			oli.dataset.path = folder.path;
			folder.tracks.sort( ( a, b ) => a.num - b.num ).forEach( track => {
				li = document.createElement( "li" );
				li.dataset.abs_path = track.abspath;
				li.dataset.title = track.title;
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
			if ( paths && paths.length ) {
				let folder = { "tracks": [], "path": "" },
					mtch, pastpath;
				playlist_fragment = document.createDocumentFragment();
				resolve( stored.concat( paths.filter( path => {
					if ( stored.some( sp => sp.a === path.a ) ) return false; // TODO check if any stored paths no longer exist
					if ( pastpath !== path.d ) {
						pastpath = path.d;
						collectionToHTML( folder );
						folder = { "tracks": [], "path": "" };
					}
					folder.path = path.d;
					if ( mtch = path.f.match( /^([0-9]+)?[ \-_]*(.+)\.([a-z0-9]+)$/ ) ) {
						folder.tracks.push( {
							"title": mtch[ 2 ].replace( /_+/g, " " ),
							"abspath": path.a,
							"type": mtch[ 3 ],
							"num": mtch[ 1 ]
						} );
						return true;
					}
					console.warn( "Unprocessable file name format: ", path );
					return false;
				} ) ) );
				collectionToHTML( folder, true );
				if ( !playlist_filter.querySelector( 'input[type="text"]' ) ) { // TODO derive from tags
					let tmplt = document.querySelector( "template" ), guts;
					[ "path", "title" ].forEach( col => {
						guts = tmplt.content.firstElementChild.cloneNode( true );
						guts.firstElementChild.textContent = col.toUpperCase();
						playlist_filter.append( guts );
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
				if ( pl && played_index < -1 ) {
					listing = played[ pl + ( ++played_index ) ];
				} else {
					played_index = 0;
					if ( queue.length ) {
						listing = queue.shift();

						// TODO if stop at the end of track lands here and the player is refreshed, the queue starts again at its next entry
							// a) was_queued = listing? a kind of honorary queue track to be cleared only when the track is ended or skipped
							// b) don't shift the queue here, but do it at track end? sounds complicated

							// at the same time;
								// address the crappy issue of not being able to stop at the end of the queue when the last track of the queue is playing

						queuend = !queue.length;
						if ( listEditorShowing() ) {
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
		// console.log( "dragStart", evt );
		evt.dataTransfer.effectAllowed = "move";
		dragee = evt.target;
	},

	trackError = evt => {
		// console.error( "trackError", currently_playing_track, evt );
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
		// console.log( "dragOver", evt );

		// TODO scrolling when outside zone
		// evt.offsetY
		// dropzone.scrollTop

		// if list_editor height is greater than the available space i.e. is scrollable
			// if the drag is near the top and the scroll isn't topped out
			// or if the drag is near the bottom and the scroll isn't bottomed out
				// scroll faster the nearer the edge gets

		evt.preventDefault();
		dropee = liFromEvtPath( evt );
		dragee.classList.add( "dragee" );
		evt.dataTransfer.dropEffect = "move";
	},

	contextMenu = evt => {
		// console.log( "contextMenu", evt );
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
			if ( query && confirm( `Google Web Search:
"${query}"` ) ) {
				chrome.tabs.create( { "url": `https://www.google.com/search?q=${query}`, "active": true } );
			}
		}
	},

	clickControls = evt => {
		// console.log( "clickControls", evt );
		let trg = evt.target;
		if ( isBtn( trg ) ) {
			let fnc = trg.name;
			if ( CONTROLS.hasOwnProperty( fnc ) ) {
				CONTROLS[ fnc ]( fnc === "listEditor" ? ( trg.dataset.list === "queue" ? queue : played ) : null );
			} else if ( TRANSPORT.hasOwnProperty( fnc ) ) {
				TRANSPORT[ fnc ]();
			}
		} else if ( trg && /^(range|checkbox|radio)$/.test( trg.type ) ) {
			trg.dataset.clicked = true;
		} else if ( trg === blur_oasis ) {
			evt.preventDefault();
		}
	},

	clickListEditor = evt => {
		// console.log( "clickListEditor", evt );
		if ( evt && evt.target.name === "clear" ) {
			if ( list_editor.dataset.list === "queue" ) {
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
	},

	drop = evt => {
		// console.log( "drop", evt );
		let q = list_editor.dataset.list === "queue";
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
			played.push( currently_playing_track );
			updatePlayedness();
			/* if ( listEditorShowing() ) {
				list_editor_list.append( currently_playing_track.cloneNode( true ) );
			} */
		}
		audio.removeAttribute( "src" );
		if ( queuend && !queue.length && untilEndOf( "queue" ) ) {
			cont = queuend = false;
		} else if ( untilEndOf( "track" ) || ( ( !ctrlChckd( "shuffle" ) || !currently_playing_folder ) && untilEndOf( "folder" ) ) ) {
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
		// console.log( "inputPlaylistFilter", evt );
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
		// console.log( "inputControls", evt );
		let trg = evt.target,
			typ = trg.type;
		if ( typ ) {
			let vlu = trg.value,
				nme = trg.name;
			if ( typ === "range" ) {
				let van = trg.valueAsNumber;
				trg.parentElement.dataset.op = van;
				if ( trg.name === "volume" ) {
					audio.volume = van;
				}
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
		// console.log( "clickPlaylistFilter", evt );
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
		// console.log( "keyDown", evt.key, evt );
		let ctrl = evt.ctrlKey,
			k = evt.key;
		if ( ctrl && k === "f" ) {
			evt.preventDefault();
			CONTROLS.playlistFilter();
		} else if ( !/^(input|select)$/i.test( evt.target.tagName ) ) { // document.activeElement
			if ( k === " " ) {
				evt.preventDefault();
				TRANSPORT.pawsTrack();
			} else if ( ctrl && k === "c" ) {
				evt.preventDefault();
				toggleCollapsed();
			} else if ( ctrl && k === "q" ) {
				evt.preventDefault();
				CONTROLS.listEditor( queue );
			} else if ( ctrl && k === "p" ) {
				evt.preventDefault();
				CONTROLS.listEditor( played );
			} else if ( ctrl && k === "g" ) {
				evt.preventDefault();
				let fcs = fromPlaylist.focussed();
				if ( fcs ) {
					googleSearch( folder( fcs ) );
				}
			} else if ( k === "Enter" ) {
				evt.preventDefault();
				let fcs = fromPlaylist.focussed();
				if ( fcs ) {
					clickPlaylist( { "trg": folder( fcs ), "ctrlKey": ctrl, "metaKey": evt.metaKey, "altKey": evt.altKey } );
				}
			} else if ( k === "Escape" ) {
				evt.preventDefault();
				removeFocussed();
				showPlaying();
			} else if ( !listEditorShowing() && !playlistFilterShowing() ) { // TODO make it work with filtered and listEditor?
				if ( /^(Arrow|Page)(Up|Down)$/.test( k ) ) {
					evt.preventDefault();
					let arrw = /^Arrow/.test( k ),
						fcs = removeFocussed(),
						up = /Up$/.test( k );
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
							addFocussed( fcs ); // the order of these operations matters
							showFocussed( fcs, suchWaw( !folderPath( fcs ) ) );
						}
					} else {
						let all = fromPlaylist[ arrw ? "tracks" : "folders" ].all(),
							waw = suchWaw( arrw );
						fcs = fcs || [].concat( all ).sort( ( a, b ) => ( a.offsetTop - waw ) + ( b.offsetTop - waw ) )[ 0 ];
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
							showFocussed( fcs, waw );
							addFocussed( fcs ); // the order of these operations matters
						}
					}
				}
			}
		}
	},

	importFiles = evt => {
		// console.log( "importFiles", evt );
		let trg = evt.target,
			slv = String.raw`${sources.libraries.value}`;
		if ( trg === sources.libraries ) {
			toggleLibraryVisibility( slv );
		} else if ( trg === sources.include ) {
			let libnme, paths, sp, cp;
			if ( slv ) {
				libnme = sources.libraries.querySelectorAll( "option" )[ sources.libraries.selectedIndex ].textContent;
			} else {
				libnme = sources.name.value;
				slv = String.raw`${sources.path.value}`;
			}
			if ( !( slv && libnme ) ) {
				alert( "You must provide the path to the library from which you intend to select folders, and a name for it." );
			} else {
				sp = slv.split( /\\|\//g ).filter( f => f );
				paths = arrayFrom( trg.files ).filter( file => /^audio\//.test( file.type ) ).map( file => {
					cp = sp.concat( file.webkitRelativePath.split( "/" ).filter( f => f ) );

					// TODO sortPlaylist() goes wonky if there's a mix of relative sources
						// only sensibly fixable with "album" recognition via tags?
						// possible dissection of the absolute file path to establish where it could fit might work :(

					return {
						"a": cp.map( pp => encodeURIComponent( pp ) ).join( "/" ),
						"f": cp.pop(),
						"d": cp.slice( sp.length ).join( " | " )
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
								let nl = { "path": slv, "name": libnme },
									libraries = ( store.libraries || [] ).filter( l => l.path !== nl.path ).concat( [ nl ] ),
									json = JSON.stringify( paths );
								setLibraries( libraries );
								if ( ( json.length + JSON.stringify( Object.assign( {}, {
									"settings": store.settings,
									"libraries": libraries,
									"played": store.played,
									"queue": store.queue
								} ) ).length ) <= chrome.storage.local.QUOTA_BYTES ) {
									chrome.storage.local.set( { "libraries": libraries, "paths": paths } );
								} else if ( confirm( `There are too many files to remember in local storage, but an alternative exists;
Would you like to store the information as a text file to be saved in your audio library?` ) ) {
									giveFile( "store", json );
									// TODO and then what?
									// file to be placed in library and loaded on init
								}
							}
						}
					} );
				}
				toggleLibraryVisibility( false );
				sources.reset();
			}
		}
	},

	clickPlaylist = evt => {
		// console.log( "clickPlaylist", evt );
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
			if ( cv === "delist" ) {
				if ( confirm( `Remove this ${tia ? "folder" : "track"} from the playlist?` ) ) {
					if ( confirm( "Do not automatically include in future?" ) ) {
						chrome.storage.local.get( store => {
							chrome.storage.local.set( { "paths": store.paths.filter( sp => {
								return ( tia ? !trg.tracks.some( li => sp.a === absPath( li ) ) : sp.a !== absPath( trg ) );
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
			"played": played.map( li => absPath( li ) ), // TODO check if there's enough space; if not?
			"queue": queue.map( li => absPath( li ) ),
			"settings": {
				scrolltoplaying: ctrlChckd( "scrolltoplaying" ),
				fadestop: controls.fade_stop.valueAsNumber,
				combifilter: fltrChckd( "combifilter" ),
				casensitive: fltrChckd( "casensitive" ),
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
				combifilter: false,
				casensitive: false,
				shuffleby: "track",
				collapsed: true,
				skiplayed: true,
				endof: "world",
				shuffle: true,
				clicky: "end",
				fadestop: 0,
				volume: 0.5
			}, settings || {} );
			audio.volume = controls.volume.value = controls.volume.parentElement.dataset.op = sttngs.volume;
			controls.fade_stop.value = controls.fade_stop.parentElement.dataset.op = sttngs.fadestop;
			playlist.classList.toggle( "collapsed", controls.collapsed.checked = sttngs.collapsed );
			controls.dataset.endof = controls.endof.value = sttngs.endof;
			controls.scrolltoplaying.checked = sttngs.scrolltoplaying;
			playlist_filter.combifilter.checked = sttngs.combifilter;
			playlist_filter.casensitive.checked = sttngs.casensitive;
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

sources.addEventListener( "change", importFiles, { passive: true } );

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
			applyStoredArrays( store ).then( t => {
				TRANSPORT.playTrack();
			} );
		} );
	} );
} );
