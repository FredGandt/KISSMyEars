
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
		all: ndx => this.get( "ol li", ndx ),
		played: ndx => this.get( "ol li.played", ndx ),
		broken: ndx => this.get( "ol li.broken", ndx ),
		filtered: ndx => this.get( "ol li.filtered", ndx ),
		notPlayed: ndx => this.get( "ol li:not(.played)", ndx ),
		notBroken: ndx => this.get( "ol li:not(.broken)", ndx ),
		queued: ndx => this.get( 'span[data-queue]:not([data-queue=""])', ndx )
	};
	this.folders = {
		all: ndx => this.get( "li[data-path]", ndx ),
		notPlayed: ndx => this.get( "li[data-path]:not(.played)", ndx )
	};
	this.filtered = ndx => this.get( "li.filtered", ndx );
	this.focussed = () => this.get( "li.focussed", 0 );
};

let currently_playing_folder,
	currently_playing_track,
	playlist_fragment,
	played_index = 0,
	queuend = false,
	played = [],
	queue = [],
	dragee,
	dropee;

const playlist_filter = document.getElementById( "playlist_filter" ),
	queue_editor = document.getElementById( "queue_editor" ),
	playlist = document.getElementById( "playlist" ),
	controls = document.getElementById( "controls" ),
	sources = document.getElementById( "sources" ),
	seek = document.getElementById( "seek" ),

	queue_editor_trash = queue_editor.querySelector( "div" ),
	queue_editor_list = queue_editor.querySelector( "ol" ),
	audio = document.querySelector( "audio" ),
	playpen = playlist.parentElement,

	fromPlaylist = new FromPlaylist(),

	notPop = arr => arr.slice( -1 )[ 0 ],

	arrayFrom = lst => Array.from( lst ),

	ctrlVlu = ctrl => controls[ ctrl ].value,

	ctrlChckd = ctrl => controls[ ctrl ].checked,

	untilEndOf = cont => isCtrlVlu( "endof", cont ),

	isShuffleBy = sb => isCtrlVlu( "shuffle_by", sb ),

	fltrChckd = ctrl => playlist_filter[ ctrl ].checked,

	isCtrlVlu = ( ctrl, vlu ) => ctrlVlu( ctrl ) === vlu,

	folderOfTrack = li => li.parentElement.parentElement,

	isBtn = trg => trg && trg.type && trg.type === "button",

	defaultEndOf = () => controls.endof.value = controls.dataset.endof,

	queueEditorShowing = () => queue_editor.classList.contains( "show" ),

	numberOfNotBrokenTracks = () => fromPlaylist.tracks.notBroken().length,

	playlistFilterShowing = () => playlist_filter.classList.contains( "show" ),

	multiTrack = ( n, tof ) => `${n} ${tof ? tof : "TRACK"}${n !== 1 ? "S" : ""}`,

	cleanTitle = () => document.title.replace( /^(?:\[(?:PAUS|STOPP)ED\] )+/, "" ),

	trackTitleDataset = listing => listing.querySelector( "span[data-title]" ).dataset,

	folder = li => ( li.dataset.path ? { "folder": li, "tracks": tracksOfFolder( li ) } : li ),

	clearFilters = () => fromPlaylist.filtered().forEach( l => l.classList.remove( "filtered" ) ),

	queueMatch = dragee => queue.findIndex( li => li.dataset.abs_path === dragee.dataset.abs_path ),

	pathsToTracks = paths => paths.map( p => playlist.querySelector( `li[data-abs_path="${p}"]` ) ),

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

		stopTrack: rs => {
			if ( audio.src ) {
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

		prevFolder: () => console.log( "prevFolder" ), // TODO

		backFolder: () => console.log( "backFolder" ), // TODO

		nextFolder: () => console.log( "nextFolder" ) // TODO
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
					if ( queueEditorShowing() ) {
						clickQueueEditor();
					}
					playlist.classList.add( "filtered" );
					return;
				}
			}
			closePlaylistFilter();
		},

		queueEditor: () => { // TODO make a general list editor and include ability to edit played
			if ( queueEditorShowing() ) {
				clickQueueEditor();
			} else {
				if ( queue.length ) {
					let clone;
					queue.forEach( q => {
						clone = q.cloneNode( true );
						clone.draggable = true;
						queue_editor_list.append( clone );
					} );
					if ( playlistFilterShowing() ) {
						closePlaylistFilter();
					}
					queue_editor.classList.add( "show" );
				}
			}
		},

		clearPlaylist: () => {
			if ( fromPlaylist.tracks.all().length && confirm( "Clear the playlist?" ) ) {
				TRANSPORT.stopTrack( true );
				playlist.innerHTML = "";
				setTitle( "KISS My Ears" );
				updatePlaylistLength();
				controls.times.dataset.dura = controls.times.dataset.rema = secondsToStr( 0 );
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

	setTrackSrc = listing => {
		audio.src = `file:///${listing.dataset.abs_path}`;
		displayTrackData( listing );
	},

	toggleLibraryVisibility = tog => {
		sources.new_lib.classList.toggle( "hide", tog );
		sources.name.value = sources.path.value = "";
	},

	removeFocussed = () => {
		let fcs = fromPlaylist.focussed();
		if ( fcs ) {
			fcs.classList.remove( "focussed" );
			return fcs;
		}
	},

	pausiblyPlay = ( paused, prev ) => {
		if ( paused ) {
			selectNext( prev );
		} else {
			TRANSPORT.playTrack( prev );
		}
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

	setLibraries = libs => { // TODO edit libraries
		if ( libs ) {
			sources.libraries.innerHTML = `<option value="" selected>add new library</option>` +
				libs.map( ( l, i ) => `<option value="${l.path}" title="${l.path}">${l.name}</option>` ).join( "" );
		}
	},

	sortPlaylist = () => {
		fromPlaylist.folders.all().sort( ( a, b ) => {
			let ap = a.dataset.path,
				bp = b.dataset.path;
			return new Intl.Collator( { // TODO seems faster somehow, but still doesn't work for "folder 10" being greater than "folder 2"
				ignorePunctuation: true,
    		sensitivity: "base",
    		caseFirst: "upper",
    		numeric: true
			} ).compare( ap, bp ); // ( ap > bp ? 1 : ( ap < bp ? -1 : 0 ) );
		} ).forEach( li => playlist.append( li ) );
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

	updatePlayedness = () => {
		let pl = played.length;
		fromPlaylist.tracks.played().forEach( li => li.classList.remove( "played" ) );
		if ( pl ) {
			played.forEach( li => li.classList.add( "played" ) );
		}
		controls.played_length.dataset.pl = multiTrack( pl );
	},

	showPlaying = () => {
		if ( currently_playing_track && ctrlChckd( "highlight" ) && !fromPlaylist.focussed() ) {
			let cpe = currently_playing_folder,
				offst = playpen.scrollTop;
			if ( !ctrlChckd( "collapsed" ) ) { // TODO isShuffleBy( "folder" )??
			 	offst += ( playpen.offsetHeight * 0.5 ); // TODO unless currently_playing_track is not visible i.e. long folder
				cpe = currently_playing_track;
			}
			requestIdleCallback( () => playpen.scrollBy( 0, cpe.offsetTop - offst ) );
		}
	},

	updateQueuetness = () => {
		let ql = queue.length;
		fromPlaylist.tracks.queued().forEach( xq => xq.dataset.queue = "" );
		if ( ql ) {
			queue.forEach( ( q, i ) => trackTitleDataset( q ).queue = ( i + 1 === ql ? ( ql === 1 ? "ONLY" : "LAST" ) : ( !i ? "NEXT" : i + 1 ) ) );
		}
		controls.queue_length.dataset.ql = multiTrack( ql );
	},

	updatePlaylistLength = () => {
		let btl = fromPlaylist.tracks.broken().length;
		controls.playlist_length.dataset.folders = multiTrack( fromPlaylist.folders.all().length, "FOLDER" );
		controls.playlist_length.dataset.tracks = multiTrack( numberOfNotBrokenTracks() );
		controls.playlist_length.dataset.broken = ( btl ? ` + ${btl} BROKEN` : "" );
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
			// TODO filter out duplicates (side effect of allowing the loading of unstored tracks)
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
					if ( stored.some( sp => sp.a === path.a ) ) return false;
					if ( pastpath !== path.d ) {
						pastpath = path.d;
						collectionToHTML( folder );
						folder = { "tracks": [], "path": "" };
					}
					folder.path = path.d;
					if ( mtch = path.f.match( /^([0-9]+)?[ \-]*(.+)\.([a-z0-9]+)$/ ) ) {
						folder.tracks.push( {
							"abspath": path.a,
							"title": mtch[ 2 ],
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
						if ( queueEditorShowing() ) {
							if ( queuend ) {
								clickQueueEditor();
							} else {
								queue_editor.querySelector( "ol li" ).remove();
							}
						}
						updateQueuetness();
					} else {
						let list = fromPlaylist.tracks.notBroken();
						if ( list.length ) {
							if ( ctrlChckd( "shuffle" ) ) {
								if ( isShuffleBy( "folder" ) ) {
									if ( currently_playing_folder ) {
										let tof = tracksOfFolder( currently_playing_folder ),
											lstndx = tof.indexOf( currently_playing_track || notPop( played ) );
										if ( ~lstndx ) {
											listing = tof[ lstndx + 1 ];
											// TODO previous/back/next folder
											if ( lstndx === tof.length - 2 ) {
												currently_playing_folder.classList.add( "played" );
												currently_playing_folder = null;
											}
										}
									} else {
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
				} else if ( untilEndOf( "world" ) && numberOfNotBrokenTracks() ) { // TODO not if shuffling by folder and there are some unplayed
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

		// if queue_editor height is greater than the available space i.e. is scrollable
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
		let trg = liFromEvtPath( evt );
		if ( trg ) {
			evt.preventDefault();
			googleSearch( trg );
		}
	},

	trackTimeUpdate = () => {
		let curt = audio.currentTime;
		controls.times.dataset.curt = secondsToStr( seek.control.value = curt );
		controls.times.dataset.rema = secondsToStr( ( audio.duration - curt ) || 0 );
	},

	googleSearch = trg => {
		if ( navigator.onLine ) {
			let query = ( trg.folder ? trg.folder.dataset.path : `${folderOfTrack( trg ).dataset.path} | ${trg.dataset.title}` );
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
				CONTROLS[ fnc ]();
			} else if ( TRANSPORT.hasOwnProperty( fnc ) ) {
				TRANSPORT[ fnc ]();
			}
		}
	},

	clickQueueEditor = evt => {
		// console.log( "clickQueueEditor", evt );
		if ( queue.length && evt && evt.target.name === "clear" && confirm( "Clear the queue?" ) ) {
			queue = [];
			updateQueuetness();
		}
		if ( evt && evt.target && !evt.target.type ) {
			return;
		}
		queue_editor.classList.remove( "show" );
		queue_editor_list.innerHTML = "";
	},

	inputControls = evt => {
		// console.log( "inputControls", evt );
		let trg = evt.target,
			typ = trg.type;
		if ( typ ) {
			let vlu = trg.value;
			if ( typ === "range" ) {
				audio.volume = trg.valueAsNumber;
			} else {
				let nme = trg.name;
				if ( typ === "checkbox" ) {
					if ( nme === "highlight" ) {
						removeFocussed();
						showPlaying();
					} else if ( nme === "collapsed" ) {
						playlist.classList.toggle( "collapsed", trg.checked );
						showPlaying();
					}
				} else if ( typ === "radio" ) {
					if ( nme === "endof" && ( vlu === "world" || vlu === "list" ) ) {
						controls.dataset.endof = vlu;
					}
				}
				toggleOptionVisibility();
			}
		}
	},

	drop = evt => {
		// console.log( "drop", evt );
		if ( dragee.parentElement ) {
			evt.preventDefault();
			let trg = evt.target;
			if ( trg === queue_editor_trash ) {
				queue_editor_trash.append( dragee );
				queue.splice( queueMatch( dragee ), 1 );
				dragee.remove();
			} else {
				let movee = queue.splice( queueMatch( dragee ), 1 )[ 0 ];
				if ( trg === queue_editor_list ) {
					queue_editor_list.append( dragee );
					queue.push( movee );
				} else {
					queue_editor_list.insertBefore( dragee, dropee );
					queue.splice( queueMatch( dropee ), 0, movee );
				}
			}
			updateQueuetness();
		}
	},

	trackEnded = () => {
		let cont = true;
		controls.times.dataset.dura = secondsToStr( 0 );
		if ( currently_playing_track ) {
			played.push( currently_playing_track );
			updatePlayedness();
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
				if ( li.dataset.title ) {
					folderOfTrack( li ).classList.add( "filtered" );
				} else {
					li.querySelectorAll( `li${fresh}` ).forEach( li => li.classList.add( "filtered" ) );
				}
			} );
		} else {
			clearFilters();
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
		} else if ( !/^(input|select)$/i.test( evt.target.tagName ) && !/^Tab$/.test( k ) ) { // document.activeElement
			evt.preventDefault();
			if ( k === " " ) {
				TRANSPORT.pawsTrack();
			} else if ( ctrl && k === "q" ) {
				CONTROLS.queueEditor();
			} else if ( ( ctrl && k === "g" ) || /^(Escape|Enter)$/.test( k ) ) {
				let fcs = removeFocussed();
				if ( fcs ) {
					let fldr = folder( fcs );
					if ( k === "Enter" ) {
						clickPlaylist( { "trg": fldr, "ctrlKey": ctrl, "metaKey": evt.metaKey, "altKey": evt.altKey } );
					} else if ( k === "g" ) {
						googleSearch( fldr );
					}
				}
				showPlaying();
			} else if ( !queueEditorShowing() && !playlistFilterShowing() ) { // TODO make it work with filtered?
				if ( /^(Arrow|Page)(Up|Down)$/.test( k ) ) {
					let arrw = /^Arrow/.test( k );
					if ( arrw && ctrlChckd( "collapsed" ) ) {
						return; // TODO navigate folder tracks only // allow breakout? :(
					}
					let all = fromPlaylist[ arrw ? "tracks" : "folders" ].all(),
						waw = playpen.scrollTop + ( arrw ? ( playpen.offsetHeight * 0.5 ) : 0 ),
						fcs = removeFocussed() || [].concat( all ).sort( ( a, b ) => ( a.offsetTop - waw ) + ( b.offsetTop - waw ) )[ 0 ];
					if ( fcs ) {
						let up = /Up$/.test( k );
						if ( arrw && fcs.dataset.path ) {
							if ( up ) {
								fcs = notPop( tracksOfFolder( fcs.previousElementSibling ) );
							} else {
								fcs = tracksOfFolder( fcs, 0 );
							}
						} else if ( !arrw && !fcs.dataset.path ) {
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
						fcs.classList.add( "focussed" );
						playpen.scrollBy( 0, fcs.offsetTop - waw );
					}
				}
			}
		}
	},

	importFiles = evt => {
		// console.log( "importFiles", evt );
		let trg = evt.target,
			slv = sources.libraries.value;
		if ( trg === sources.libraries ) {
			toggleLibraryVisibility( slv );
		} else if ( trg === sources.include ) {
			let libnme, paths, sp, cp;
			if ( slv ) {
				libnme = sources.libraries.querySelectorAll( "option" )[ sources.libraries.selectedIndex ].textContent;
			} else {
				libnme = sources.name.value;
				slv = sources.path.value;
			}
			if ( !( slv && libnme ) ) {
				alert( "You must provide the path to the library from which you intend to select folders, and a name for it." );
			} else {
				sp = slv.split( "/" ).filter( f => f );
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
		let trg = ( evt.trg || liFromEvtPath( evt ) );
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

			// TODO play immediately doesn't if the player is stopped
			// TODO if ( controls.shuffle etc ) offer to shuffle before adding folders to the queue?

			// TODO if ( a queued track has been delisted ) make sure the further options are clearly indicated as not required
			if ( cv === "delist" ) {
				if ( confirm( `Remove this ${tia ? "folder" : "track"} from the playlist?` ) ) {
					if ( confirm( "Do not automatically include in future?" ) ) {
						chrome.storage.local.get( store => {
							chrome.storage.local.set( { "paths": store.paths.filter( sp => {
								return ( tia ? !trg.tracks.some( li => sp.a === li.dataset.abs_path ) : sp.a !== trg.dataset.abs_path );
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
				TRANSPORT.nextTrack();
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
			// TODO played folders
			"played": played.map( li => li.dataset.abs_path ), // TODO check if there's enough space; if not?
			"queue": queue.map( li => li.dataset.abs_path ),
			"settings": {
				combifilter: fltrChckd( "combifilter" ),
				casensitive: fltrChckd( "casensitive" ),
				volume: controls.volume.valueAsNumber,
				highlight: ctrlChckd( "highlight" ),
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
				combifilter: false,
				casensitive: false,
				shuffleby: "track",
				collapsed: false,
				highlight: true,
				skiplayed: true,
				endof: "world",
				shuffle: true,
				clicky: "end",
				volume: 0.5
			}, settings || {} );
			playlist.classList.toggle( "collapsed", controls.collapsed.checked = sttngs.collapsed );
			controls.dataset.endof = controls.endof.value = sttngs.endof;
			playlist_filter.combifilter.checked = sttngs.combifilter;
			playlist_filter.casensitive.checked = sttngs.casensitive;
			audio.volume = controls.volume.value = sttngs.volume;
			controls.highlight.checked = sttngs.highlight;
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
controls.addEventListener( "click", clickControls, { passive: true } );

seek.addEventListener( "input", seekTrack, { passive: true } );

playlist.addEventListener( "contextmenu", contextMenu );
playlist.addEventListener( "click", clickPlaylist, { passive: true } );

playlist_filter.addEventListener( "input", inputPlaylistFilter, { passive: true } );
playlist_filter.addEventListener( "click", clickPlaylistFilter, { passive: true } );

queue_editor.addEventListener( "click", clickQueueEditor, { passive: true } );
queue_editor.addEventListener( "dragstart", dragStart, { passive: true } );
queue_editor.addEventListener( "dragend", dragEnd, { passive: true } );
queue_editor.querySelectorAll( ".dropzone" ).forEach( dz => {
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
