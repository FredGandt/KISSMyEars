
// TODO use virtual DOM for DOM_PLAYLIST

// TODO start shuffle play again after e.g. finishing a folder etc.

// TODO gapless playback (surprisingly shitty)

// TODO merge new imports into related folders
	// CONTROLS.fixBreakages()

// TODO save queue as playlist
	// giveFile()

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

// TODO maybe
	// repeat global__queue or global__played
	// indexedDB instead of localStorage
	// skip silent sections in tracks e.g. leading to hidden tracks.
		// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
		// https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode

"use strict";

function FromPlaylist() {
	this.get = ( qs, only ) => {
		let arr = arrayFrom( DOM_PLAYLIST.querySelectorAll( qs ) )
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
		notPlayed: ndx => this.get( "li[data-folder_struct]:not(.played)", ndx ),
		all: ndx => this.get( "li[data-folder_struct]", ndx )
	};
	this.filtered = ndx => this.get( "li.filtered", ndx );
	this.focussed = () => this.get( "li.focussed", 0 );
	this.played = ndx => this.get( "li.played", ndx );
};

let global__current_playing_folder,
	global__current_playing_track,
	global__track_sequence = [],
	global__played_index = null,
	global__playlist_fragment,
	global__queue_end = false,
	global__sequences = [],
	global__sequence = [],
	global__track_id = 0,
	global__played = [],
	global__queue = [],
	user_reset = false,
	global__dragee,
	global__dropee,

	debugging = false;

const DOM_PLAYLIST_FILTER = document.getElementById( "playlist_filter" ),
	DOM_LIST_EDITOR = document.getElementById( "list_editor" ),
	DOM_PLAYLIST = document.getElementById( "playlist" ),
	DOM_CONTROLS = document.getElementById( "controls" ),
	DOM_SOURCES = document.getElementById( "sources" ),
	DOM_SEEK = document.getElementById( "seek" ),
	DOM_SPP = document.getElementById( "spp" ), // TODO id?

	DOM_LIST_EDITOR_TRASH = DOM_LIST_EDITOR.querySelector( "div" ),
	DOM_LIST_EDITOR_LIST = DOM_LIST_EDITOR.querySelector( "ol" ),
	DOM_AUDIO = document.querySelector( "audio" ),
	DOM_PLAYPEN = DOM_PLAYLIST.parentElement,
	DOM_BODY = document.body,

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

	/* utility */

	cloneOf = arr => [].concat( arr ),

	notPop = arr => arr.slice( -1 )[ 0 ],

	arrayFrom = lst => Array.from( lst ),

	underspace = str => str.replace( /_+/g, " " ),

	randNum = n => Math.floor( Math.random() * n ),

	arrayExistsAndHasLength = arr => arr && arr.length, // TODO deploy at all array.length checks?

	/* controls and UI */

	ctrlVlu = ctrl => DOM_CONTROLS[ ctrl ].value,

	untilEndOf = cont => isCtrlVlu( "endof", cont ),

	ctrlChckd = ctrl => DOM_CONTROLS[ ctrl ].checked,

	isShuffleBy = sb => isCtrlVlu( "shuffleby", sb ),

	isCtrlVlu = ( ctrl, vlu ) => ctrlVlu( ctrl ) === vlu,

	isBtn = trg => trg && trg.type && trg.type === "button",

	fltrChckd = ctrl => DOM_PLAYLIST_FILTER[ ctrl ].checked,

	listEditorShowing = () => DOM_LIST_EDITOR.classList.contains( "show" ),

	defaultEndOf = () => DOM_CONTROLS.endof.value = DOM_CONTROLS.dataset.endof,

	multiTrack = ( n, tof ) => `${n} ${tof ? tof : "TRACK"}${n !== 1 ? "S" : ""}`,

	listEditingQueue = trg => ( trg || DOM_LIST_EDITOR ).dataset.list === "queue",

	halfPlaypen = () => DOM_PLAYPEN.scrollTop + ( DOM_PLAYPEN.offsetHeight * 0.5 ),

	playingPlayed = () => DOM_SPP.classList.toggle( "show", global__played_index ),

	playlistFilterShowing = () => DOM_PLAYLIST_FILTER.classList.contains( "show" ),

	cleanTitle = () => document.title.replace( /^(?:\[(?:PAUS|STOPP)ED\] )+/, "" ),

	setTitle = ( ttl, pp ) => document.title = ( ttl ? ttl + ( pp ? ` ${cleanTitle()}` : "" ) : cleanTitle() ), // TODO maintain "[STOPPED/PAUSED]" prefix if nexting from stopped

	clearFilters = done => {
		if ( done ) {
			DOM_PLAYLIST.classList.remove( "filtered" );
		}
		fromPlaylist.filtered().forEach( li => li.classList.remove( "filtered" ) );
	},

	/* tracks and folders */

	// TODO reduce paths object size

	trackID = li => li.dataset.id,

	trackAbsPath = li => li.dataset.track_abs_path,

	trackIDs = lst => lst.map( li => trackID( li ) ),

	folderOfTrack = li => li.parentElement.parentElement,

	folderStruct = li => li ? li.dataset.folder_struct : undefined,

	numberOfNotBrokenTracks = () => fromPlaylist.tracks.notBroken().length,

	trackTitleDataset = li => li.querySelector( "span[data-title]" ).dataset,

	tracksFromIDs = ids => ids.map( id => DOM_PLAYLIST.querySelector( `li[data-id="${id}"]` ) ),

	folder = li => ( folderStruct( li ) ? { "folder": li, "tracks": tracksOfFolder( li ) } : li ),

	listMatch = ( d, q ) => ( q ? global__queue : global__played ).findIndex( li => trackAbsPath( li ) === trackAbsPath( d ) ),

	sortPlaylist = () => fromPlaylist.folders.all().sort( ( a, b ) => collator.compare( folderStruct( a ), folderStruct( b ) ) ).forEach( li => DOM_PLAYLIST.append( li ) ),

	TRANSPORT = {
		backTrack: () => DOM_AUDIO.currentTime = 0,

		nextTrack: prev => {
			let paused = DOM_AUDIO.paused;
			TRANSPORT.stopTrack( true );
			if ( !prev && playingPlayed() ) {
				++global__played_index;
			}
			if ( paused ) {
				selectNext( prev );
			} else {
				TRANSPORT.playTrack( prev );
			}
		},

		playTrack: prev => {
			selectNext( prev ).then( t => {
				if ( DOM_AUDIO.src && DOM_AUDIO.paused ) {
					DOM_AUDIO.play();
					setTitle();
				}
			} );
		},

		pawsTrack: () => {
			if ( DOM_AUDIO.src ) {
				if ( DOM_AUDIO.paused ) {
					DOM_AUDIO.play();
					setTitle();
				} else {
					DOM_AUDIO.pause();
					setTitle( "[PAUSED]", true );
				}
			}
		},

		// TODO "previous" handling is a mess
			// global__played needs to be all tracks that have been played for at least around 2 seconds?
			// an overide is needed when suffle is off, so rather than previously played, it selects the previous track in the DOM_PLAYLIST

		prevTrack: () => {
			let pl = global__played.length;
			if ( pl ) {
				if ( playingPlayed() && Math.abs( global__played_index ) < pl ) {
					--global__played_index;
				} else {
					global__played_index = -1;
				}
			}
			TRANSPORT.nextTrack( true );
		},

		stopTrack: async rs => {
			if ( DOM_AUDIO.src ) {
				let fade;
				if ( !rs && DOM_AUDIO.volume && ( fade = DOM_CONTROLS.soft_stop.valueAsNumber ) ) {
					await softStop( Math.round( 0.02 * fade ) );
				}
				DOM_AUDIO.pause();
				DOM_AUDIO.volume = DOM_CONTROLS.volume.valueAsNumber;
				TRANSPORT.backTrack();
				if ( rs ) {
					DOM_AUDIO.removeAttribute( "src" );
				} else {
					setTitle( "[STOPPED]", true );
				}
			}
		},

		prevFolder: () => {
			global__current_playing_folder = folderOfTrack( cloneOf( global__played ).reverse().find( trck => folderOfTrack( trck ) !== global__current_playing_folder ) );
			TRANSPORT.nextTrack();
		},

		backFolder: () => {
			global__current_playing_track = null;
			TRANSPORT.nextTrack();
		},

		// TODO allow next and back folder when not shuffle playing

		nextFolder: () => {
			global__current_playing_folder = null;
			TRANSPORT.nextTrack();
		}
	},

	CONTROLS = {
		fixBreakages: () => debugMsg( "fixBreakages:", fromPlaylist.tracks.broken(), "warn" ), // TODO all the things

		switchControls: () => {
			let sc = DOM_CONTROLS.switchControls;
			sc.value = ( DOM_BODY.classList.toggle( "display_controls_left", sc.value === "LEFT" ) ? "RIGHT" : "LEFT" );
		},

		sequencify: () => {
			if ( global__sequence.length ) {
				global__sequences.push( trackIDs( global__sequence ) );
				chrome.storage.local.set( { "sequences": global__sequences } );
				clear( "global__sequence" );
			}
		},

		stopPlayingPlayed: () => {
			global__played_index = null;
			if ( confirm( "After this track?" ) ) {
				global__current_playing_track = null;
			} else {
				TRANSPORT.nextTrack();
			}
		},

		clearPlayedTracks: () => {
			if ( global__played.length && confirm( "Clear the play history?" ) ) {
				global__played = [];
				updatePlayedness();
			}
		},

		playlistFilter: () => {
			if ( numberOfNotBrokenTracks() ) {
				if ( DOM_PLAYLIST_FILTER.classList.toggle( "show" ) ) {
					DOM_PLAYLIST_FILTER.pff.disabled = false;
					DOM_PLAYLIST_FILTER.querySelector( 'input[name="contains"]' ).focus();
					if ( listEditorShowing() ) {
						clickListEditor();
					}
					return;
				}
			}
			closePlaylistFilter();
		},

		listEditor: list => {

			// TODO switch from "global__queue" to "global__played" and back

			// TODO sequence editing

			if ( listEditorShowing() ) {
				clickListEditor();
			} else if ( list.length ) {
				let clone;
				list.forEach( q => {
					clone = q.cloneNode( true );
					clone.draggable = true;
					DOM_LIST_EDITOR_LIST.append( clone ); // TODO include folder info for display or scrap cloning in favour of filtering?
				} );
				if ( playlistFilterShowing() ) {
					closePlaylistFilter();
				}
				DOM_LIST_EDITOR.dataset.list = ( list === global__queue ? "queue" : "played" );
				DOM_LIST_EDITOR.classList.add( "show" );
				DOM_LIST_EDITOR.pff.disabled = false;
				DOM_LIST_EDITOR.done.focus();
			}
		},

		clearPlaylist: () => {
			if ( fromPlaylist.tracks.all().length && confirm( "Clear the playlist?" ) ) {
				TRANSPORT.stopTrack( true );
				DOM_PLAYLIST.innerHTML = "";
				setTitle( "KISS My Ears" );
				updatePlaylistLength();
				let tds = DOM_CONTROLS.times.dataset;
				tds.dura = tds.rema = secondsToStr();
			}
			chrome.storage.local.get( store => {
				if ( arrayExistsAndHasLength( store.paths ) && confirm( "Clear the automatically included tracks? Queued, played or sequenced tracks will also be cleared." ) ) {

					// TODO find a way to reapply sequences and other markers to new imports

					clear( "global__queue" );
					clear( "global__played" );
					clear( "global__sequences" );
					chrome.storage.local.remove( "paths" );
					chrome.storage.local.remove( "queue" );
					chrome.storage.local.remove( "played" );
					chrome.storage.local.remove( "sequences" );
				}
				if ( arrayExistsAndHasLength( store.libraries ) && confirm( "Clear the stored libraries?" ) ) {
					chrome.storage.local.remove( "libraries" );

					// TODO clear the GUI too
				}
				if ( store.settings && confirm( "Clear the settings and reload the player?" ) ) {
					chrome.storage.local.remove( "settings" );
					user_reset = true;
					location.reload();
				}
			} );
		}
	},

	clear = arr => {
		switch ( arr ) {
			case "global__queue": {
				global__queue = [];
				updateQueuetness();
				break;
			}
			case "global__played": {
				global__played = [];
				updatePlayedness();
				break;
			}
			case "global__sequence": { // TODO desequence tracks ... whoops
				global__sequence = [];
				updateSequences();
				break;
			}
			case "global__sequences": {
				global__sequences = [];
				updateSequences();
				break;
			}
		}
	},

	shuffleArray = arr => {
		arr.forEach( ( r, i ) => {
			r = randNum( i + 1 );
			[ arr[ i ], arr[ r ] ] = [ arr[ r ], arr[ i ] ];
		} );
	},

	sequenced = ( li, ndx ) => {
		let dss = trackTitleDataset( li );
		if ( ndx !== undefined ) {
			dss.sequence = ndx;
		}
		return dss.sequence;
	},

	setLibraries = libs => {
		if ( libs ) {
			DOM_SOURCES.libraries.innerHTML = `<option value="" selected>ADD NEW LIBRARY</option>` +
				libs.map( ( l, i ) => `<option value="${l.lib_path}" title="${l.lib_path}">${l.lib_name}</option>` ).join( "" );
		}
	},

	showPlaying = () => {

		// TODO goes wonky sometimes after being brought to the foreground

		// TODO isShuffleBy( "folder" )??

		// TODO adjust offset if global__current_playing_track is not visible i.e. long folders

		let fcs = fromPlaylist.focussed();
		if ( fcs || ( global__current_playing_track && ctrlChckd( "scrolltoplaying" ) ) ) {
			requestIdleCallback( () => DOM_PLAYPEN.scrollBy( 0, ( fcs || global__current_playing_track ).offsetTop - DOM_PLAYPEN.offsetTop - halfPlaypen() ) );
		}
	},

	removeFocussed = () => {
		let fcs = fromPlaylist.focussed();
		if ( fcs ) {
			if ( !folderStruct( fcs ) ) {
				folderOfTrack( fcs ).classList.remove( "focussed_folder" );
			}
			fcs.classList.remove( "focussed" );
			return fcs;
		}
	},

	softStop = ms => {
		return new Promise( resolve => {
			let fadeout = setInterval( () => {
				if ( ( DOM_AUDIO.volume -= ( DOM_AUDIO.volume * 0.1 ) ) < 0.002 ) {
					clearInterval( fadeout );
					DOM_AUDIO.volume = 0;
					resolve( true );
				}
			}, ms );
		} );
	},

	closePlaylistFilter = () => {
		DOM_PLAYLIST_FILTER.classList.remove( "show" );
		DOM_PLAYLIST_FILTER.pff.disabled = true;
		document.activeElement.blur();
		DOM_PLAYLIST_FILTER.reset();
		clearFilters( true );
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

	googleSearch = trg => {
		if ( navigator.onLine ) {
			let query = ( trg.folder ? folderStruct( trg.folder ) : `${folderStruct( folderOfTrack( trg ) )} | ${trg.dataset.title}` );

			// TODO with tags; track search should be "{artist} {title}"

			if ( query && confirm( `Google Web Search:
"${query}"` ) ) {
				chrome.tabs.create( { "url": `https://www.google.com/search?q=${encodeURIComponent( query )}`, "active": true } );
			}
		}
	},

	updatePlaylistLength = () => {
		let btl = fromPlaylist.tracks.broken().length,
			pllds = DOM_CONTROLS.playlist_length.dataset;
		pllds.folders = multiTrack( fromPlaylist.folders.all().length, "FOLDER" );
		pllds.tracks = multiTrack( numberOfNotBrokenTracks() );
		pllds.broken = ( btl ? ` + ${btl} BROKEN` : "" );
		DOM_CONTROLS.fixBreakages.classList.toggle( "show", btl ); // TODO CONTROLS.fixBreakages()
	},

	updateQueuetness = () => {
		let ql = global__queue.length;
		fromPlaylist.tracks.queued().forEach( xq => xq.dataset.queue = "" ); // TODO alter instead of clear and reapply
		if ( DOM_CONTROLS.classList.toggle( "show_cont_queue", ql ) ) {
			global__queue.forEach( ( q, i ) => trackTitleDataset( q ).queue = ( i + 1 === ql ? ( ql === 1 ? "ONLY" : "LAST" ) : ( !i ? "NEXT" : i + 1 ) ) );
		}
		DOM_CONTROLS.queue_length.dataset.ql = multiTrack( ql );
	},

	updatePlayedness = () => {

		// TODO stop at the end of played?

		fromPlaylist.played().forEach( li => li.classList.remove( "played" ) ); // TODO alter instead of clear and reapply
		DOM_CONTROLS.played_length.dataset.pl = multiTrack( global__played.length ); // TODO indicate duplications?
		let fldr;
		global__played.forEach( li => {
			li.classList.add( "played" );
			fldr = folderOfTrack( li );
			if ( !tracksOfFolder( fldr ).filter( trck => !trck.classList.contains( "played" ) ).length ) {
				fldr.classList.add( "played" );
			}
		} );
	},

	updateSequences = () => {
		let sl = global__sequence.length;
		if ( sl ) {
			global__sequence.forEach( ( li, i ) => sequenced( li, `NEW:${i + 1}` ) );
			if ( DOM_CONTROLS.sequence_fs.classList.toggle( "show", sl > 1 ) ) {
				DOM_CONTROLS.sequence_length.dataset.sl = multiTrack( sl );
			}
		} else {
			DOM_CONTROLS.sequence_fs.classList.remove( "show" );
			global__sequences.forEach( ( squnc, ndx ) => tracksFromIDs( squnc ).forEach( ( li, i ) => sequenced( li, `${ndx + 1}:${i + 1}` ) ) );

			// TODO removal of dead sequences

			// TODO sequence editor
		}
	},

	giveFile = ( name, cntnt ) => {
		let blob = new Blob( [ cntnt ], { type: "text/plain" } ),
			ourl = URL.createObjectURL( blob ),
			a = document.createElement( "a" );
		a.href = ourl;
		a.download = name;
		DOM_BODY.append( a );
		a.click();
		a.remove();
		URL.revokeObjectURL( ourl );
	},

	toggleOptionsVisibility = () => {
		let dccl = DOM_CONTROLS.classList;
		if ( !dccl.toggle( "hide_shuffle_by", !ctrlChckd( "shuffle" ) ) ) {
			if ( dccl.toggle( "hide_cont_folder", !isShuffleBy( "folder" ) ) ) {
				if ( untilEndOf( "folder" ) ) {
					defaultEndOf();
				}
			}
		} else {
			dccl.remove( "hide_cont_folder" );
		}
	},

	secondsToStr = f => {
		if ( f ) {
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
		}
		return "00:00";
	},

	mindTheStore = store => {
		return new Promise( resolve => {
			if ( store ) {
				let p = store.played,
					q = store.queue;
				if ( arrayExistsAndHasLength( p ) ) {
					global__played = global__played.concat( tracksFromIDs( p ) );
					updatePlayedness();
				}
				if ( arrayExistsAndHasLength( q ) ) {
					global__queue = global__queue.concat( tracksFromIDs( q ) );
					updateQueuetness();
				}
				if ( store.sequences ) {
					global__sequences = global__sequences.concat( store.sequences ); // TODO tracksFromIDs?
					updateSequences();
				}
			}
			resolve( true );
		} );
	},

	displayTrackData = listing => {
		if ( global__current_playing_track ) {
			global__current_playing_track.classList.remove( "playing" );
			if ( global__current_playing_folder ) {
				global__current_playing_folder.classList.remove( "playing" );
			}
		}
		if ( listing ) {
			global__current_playing_folder = folderOfTrack( global__current_playing_track = listing );
			global__current_playing_folder.classList.add( "playing" );
			listing.classList.add( "playing" );
			setTitle( listing.dataset.title );
			showPlaying();
		} else {
			global__current_playing_folder = global__current_playing_track = null;
			CONTROLS.clearPlayedTracks();
			setTitle( "KISS My Ears" );
		}
	},

	collectionToHTML = ( folder, end ) => {

		// TODO use tags to determine fields to create

		if ( folder && arrayExistsAndHasLength( folder.tracks ) ) {
			let ol = document.createElement( "ol" ),
				oli = document.createElement( "li" ),
				li, spn;
			oli.dataset.folder_struct = folder.path;
			folder.tracks.sort( ( a, b ) => a.num - b.num ).forEach( track => {
				li = document.createElement( "li" );
				li.dataset.track_abs_path = track.abspath; // TODO reduce paths object size
				li.dataset.title = track.title;
				li.dataset.id =  track.id;
				[ ( parseInt( track.num ) || 0 ), track.title ].forEach( ( disp, i ) => {
					spn = document.createElement( "span" );
					spn.dataset.display = disp;
					if ( i ) {
						spn.dataset.title = "";
					}
					li.append( spn );
				} );
				ol.append( li );
			} );
			li.dataset.last_track = true;
			oli.append( ol );
			global__playlist_fragment.append( oli );
			if ( end ) {
				DOM_PLAYLIST.append( global__playlist_fragment );
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
				global__playlist_fragment = document.createDocumentFragment();

				// TODO reduce paths object size

				resolve( stored.concat( paths.filter( path => {
					if ( stored.some( sp => sp.a === path.a ) ) {
						return false;
					}
					if ( pastpath !== path.d ) {
						pastpath = path.d;
						collectionToHTML( folder );
						folder = { "tracks": [], "path": "" }; // TODO folder_struct
					}
					folder.path = path.d;
					global__track_id = Math.max( global__track_id, path.i );
					if ( mtch = path.f.match( /^([0-9]+)?[ \-_]*(.+)\.[a-z0-9]+$/ ) ) {
						folder.tracks.push( {
							"title": underspace( mtch[ 2 ] ),
							"abspath": path.a,
							"num": mtch[ 1 ],
							"id": path.i
						} );
						return true;
					}
					debugMsg( "Unprocessable file name format:", path, "warn" ); // TODO what if the folder is empty?
					return false;
				} ) ) );

				// TODO reduce paths object size

				collectionToHTML( folder, true );
				if ( !DOM_PLAYLIST_FILTER.querySelector( 'input[type="text"]' ) ) { // TODO derive from tags
					let tmplt = document.querySelector( "template" ), guts; // TODO global?
					[ "folder_struct", "title" ].forEach( col => {
						guts = tmplt.content.firstElementChild.cloneNode( true );
						let lgnd = guts.firstElementChild;
						lgnd.textContent = underspace( lgnd.dataset.data = col );
						DOM_PLAYLIST_FILTER.pff.append( guts );
					} );
				}
			}
		} );
	},

	selectNext = prev => {
		return new Promise( resolve => {
			if ( !DOM_AUDIO.src ) {
				let listing;
				if ( !ctrlChckd( "ignoresequences" ) && global__track_sequence.length ) {
					listing = global__track_sequence.shift();

					// TODO a mix of sequenced and queued tracks can be bad

				} else {
					let pl = global__played.length, si;
					global__track_sequence = [];
					if ( pl && playingPlayed() ) {
						listing = global__played[ pl + global__played_index ];
					} else {
						global__played_index = null;
						if ( global__queue.length ) {
							listing = global__queue.shift();

							// TODO if stop at the end of track lands here and the player is refreshed, the queue starts again at its next entry
								// a) was_queued = listing? a kind of honorary queue track to be cleared only when the track is ended or skipped
								// b) don't shift the queue here, but do it at track end? sounds complicated
								// at the same time;
									// address the crappy issue of not being able to stop at the end of the queue when the last track of the queue is playing

							global__queue_end = !global__queue.length;
							if ( listEditorShowing() && listEditingQueue() ) {
								if ( global__queue_end ) {
									clickListEditor();
								} else {
									DOM_LIST_EDITOR.querySelector( "ol li" ).remove();
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

										if ( global__current_playing_folder ) {
											let tof = tracksOfFolder( global__current_playing_folder ),
												lstndx = tof.indexOf( global__current_playing_track );
											if ( lstndx < tof.length - 1 ) {
												listing = tof[ lstndx + 1 ];
											} else {
												global__current_playing_folder.classList.remove( "playing" ); // TODO check this // why doesn't this happen at displayTrackData?
												global__current_playing_folder.classList.add( "played" );
											}
										}
										if ( !listing ) {
											if ( ctrlChckd( "skiplayed" ) ) {
												list = fromPlaylist.folders.notPlayed();
											} else {
												list = fromPlaylist.folders.all();
											}
											listing = tracksOfFolder( global__current_playing_folder = list[ randNum( list.length ) ], 0 );
										}
									} else {
										if ( ctrlChckd( "skiplayed" ) ) {
											list = fromPlaylist.tracks.notPlayed();
										}
										listing = list[ randNum( list.length ) ];
									}
								} else {

									// TODO allow next and back folder when not shuffle playing

									// TODO allow skipping played tracks when not shuffle playing?

									let lstndx = list.indexOf( global__current_playing_track || notPop( global__played ) );
									listing = list[ ~lstndx ? lstndx + ( prev ? -1 : 1 ) : 0 ];
								}
							}
						}
					}
					if ( listing && !ctrlChckd( "ignoresequences" ) && ( si = sequenced( listing ) ) ) {

						// TODO when playing played?

						// TODO if ( untilEndOf( "queue" ) && the last track of the queue is sequenced and not the last track of that sequence ) { stop at the end of the sequence }

						global__track_sequence = tracksFromIDs( global__sequences[ parseInt( si ) - 1 ] );
						listing = global__track_sequence.shift();
					}
					DOM_CONTROLS.classList.toggle( "show_cont_sequence", global__track_sequence.length );
				}
				if ( listing ) {
					DOM_AUDIO.src = `file:///${trackAbsPath( listing )}`;
					displayTrackData( listing );
				} else if ( untilEndOf( "world" ) && numberOfNotBrokenTracks() ) {
					DOM_AUDIO.removeAttribute( "src" );
					displayTrackData();
					TRANSPORT.playTrack(); // TODO why is this here?
				}
			}
			resolve( true );
		} );
	},

	/* event functions */

	dragEnd = () => global__dragee.classList.remove( "dragee" ),

	seekTrack = evt => DOM_AUDIO.currentTime = evt.target.value,

	liFromEvtPath = evt => folder( evt.composedPath().find( e => e.tagName && e.tagName.toLowerCase() === "li" ) ),

	setTrackDuration = () => DOM_CONTROLS.times.dataset.dura = secondsToStr( DOM_SEEK.control.max = Math.ceil( DOM_AUDIO.duration ) ),

	dragStart = evt => {
		debugMsg( "dragStart:", evt );
		evt.dataTransfer.effectAllowed = "move";
		global__dragee = evt.target;
	},

	trackError = evt => {
		debugMsg( "trackError:", { "evt": evt, "global__current_playing_track": global__current_playing_track }, "error" );
		global__current_playing_track.classList.add( "broken" );
		updatePlaylistLength();
		TRANSPORT.nextTrack();

		// TODO playback seizes with "Uncaught (in promise) DOMException: Failed to load because no supported source was found" error that makes no sense

		// TODO mark folders as broken if all their tracks are?

		// TODO offer to remove or do it automatically and give notice?
			// CONTROLS.fixBreakages()

		// TODO clean up GUI "breakages" button and counter after broken tracks are removed
			// updatePlaylistLength
	},

	dragOver = evt => {
		debugMsg( "dragOver:", evt );
		evt.preventDefault();
		global__dropee = liFromEvtPath( evt );
		global__dragee.classList.add( "dragee" );
		evt.dataTransfer.dropEffect = "move";
	},

	trackTimeUpdate = () => {
		let curt = DOM_AUDIO.currentTime,
			tds = DOM_CONTROLS.times.dataset;
		tds.curt = secondsToStr( DOM_SEEK.control.value = curt );
		tds.rema = secondsToStr( ( DOM_AUDIO.duration - curt ) || 0 );
	},

	clickControls = evt => {
		debugMsg( "clickControls:", evt );
		let trg = evt.target;
		if ( isBtn( trg ) ) {
			let fnc = trg.name;
			if ( CONTROLS.hasOwnProperty( fnc ) ) {
				CONTROLS[ fnc ]( fnc === "listEditor" ? ( listEditingQueue( trg ) ? global__queue : global__played ) : null );
			} else if ( TRANSPORT.hasOwnProperty( fnc ) ) {
				TRANSPORT[ fnc ]();
			}
		} else if ( trg && /^(range|checkbox)$/.test( trg.type ) ) {
			trg.dataset.clicked = true;
		} else if ( ~evt.composedPath().indexOf( DOM_CONTROLS.blur_oasis ) ) {
			evt.preventDefault();
		}
	},

	clickListEditor = evt => {

		// TODO all DOM_PLAYLIST click actions in DOM_LIST_EDITOR too?

		debugMsg( "clickListEditor:", evt );
		if ( evt && evt.target.name === "clear" ) {
			if ( listEditingQueue() ) {
				if ( global__queue.length && confirm( "Clear the queue?" ) ) {
					clear( "global__queue" );
				}
			} else if ( global__played.length && confirm( "Clear played tracks?" ) ) {
				clear( "global__played" );
			}
		}
		if ( evt && evt.target && !evt.target.type ) {
			return;
		}
		DOM_LIST_EDITOR.classList.remove( "show" );
		DOM_LIST_EDITOR_LIST.innerHTML = "";
		DOM_LIST_EDITOR.pff.disabled = true;
	},

	drop = evt => {
		debugMsg( "drop:", evt );

		// TODO why can't I edit the order of global__played?

		let q = listEditingQueue();
		if ( global__dragee.parentElement ) {
			evt.preventDefault();
			let trg = evt.target;
			if ( trg === DOM_LIST_EDITOR_TRASH ) {
				DOM_LIST_EDITOR_TRASH.append( global__dragee );
				( q ? global__queue : global__played ).splice( listMatch( global__dragee, q ), 1 );
				global__dragee.remove();
			} else if ( q ) {
				let movee = global__queue.splice( listMatch( global__dragee, true ), 1 )[ 0 ];
				if ( trg === DOM_LIST_EDITOR_LIST ) {
					DOM_LIST_EDITOR_LIST.append( global__dragee );
					global__queue.push( movee );
				} else {
					DOM_LIST_EDITOR_LIST.insertBefore( global__dragee, global__dropee );
					global__queue.splice( listMatch( global__dropee, true ), 0, movee );
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
		DOM_CONTROLS.times.dataset.dura = secondsToStr();
		if ( global__current_playing_track ) {
			if ( playingPlayed() ) {
				++global__played_index;
			} else {
				global__played.push( global__current_playing_track );
				updatePlayedness();
				if ( listEditorShowing() && DOM_LIST_EDITOR.dataset.list === "played" ) {
					let clone = global__current_playing_track.cloneNode( true );
					clone.draggable = true;
					DOM_LIST_EDITOR_LIST.append( clone );
				}
			}
		}
		DOM_AUDIO.removeAttribute( "src" );

		// TODO untilEndOf( "sequence" )

		if ( global__queue_end && !global__queue.length && untilEndOf( "queue" ) ) {
			cont = global__queue_end = false;
		} else if ( untilEndOf( "track" ) || ( untilEndOf( "folder" ) && global__current_playing_track && global__current_playing_track.dataset.last_track ) ) {
			cont = false;
		}
		if ( cont ) {
			TRANSPORT.playTrack();
		} else {

			// TODO this might be a good place to start addressing stopping at the end of clearing the next track from whatever list

			selectNext().then( t => {
				setTitle( "[STOPPED]", true );
				defaultEndOf();
			} );
		}
	},

	setFilters = ( to_fltr, fresh ) => { // TODO not actually an event function
		clearFilters();

		// TODO for efficiency; only clear what isn't about to be filtered?

		DOM_PLAYLIST.classList.add( "filtered" );
		to_fltr.forEach( li => {
			li.classList.add( "filtered" );
			if ( !folderStruct( li ) ) {
				folderOfTrack( li ).classList.add( "filtered" );
			} else {
				li.querySelectorAll( `li${fresh || ""}` ).forEach( li => li.classList.add( "filtered" ) );
			}
		} );
	},

	inputPlaylistFilter = evt => {

		// TODO multi filters e.g. path contains "kings" & "wild" etc.

		debugMsg( "inputPlaylistFilter:", evt );
		let fltrs = arrayFrom( DOM_PLAYLIST_FILTER.querySelectorAll( 'input[type="text"]' ) ).filter( f => f.value );
		if ( fltrs.length ) {
			let fresh = ( fltrChckd( "onlyunplayed" ) ? ":not(.played)" : "" ), // TODO skiplayed?
				insens = ( fltrChckd( "casensitive" ) ? "" : " i" ), tag, mth,
				fltr = fltrs.map( npt => {
					tag = npt.parentElement.querySelector( "legend" ).dataset.data;
					mth = { "starts": "^", "contains": "*", "ends": "$" }[ npt.name ];
					return `li[data-${tag}${mth}="${npt.value}"${insens}]:not(.broken)${fresh}`;
				} ).join( fltrChckd( "combifilter" ) ? " " : "," );

			debugMsg( "inputPlaylistFilter - fltr:", fltr ); // TODO combifilter won't work like this for more fields/tags

			setFilters( DOM_PLAYLIST.querySelectorAll( fltr ), fresh );
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
					DOM_AUDIO.volume = vlu;
				} else {
					vlu *= 0.001;
				}
				trg.parentElement.dataset.op = vlu;
			} else {
				if ( typ === "checkbox" ) {
					if ( nme === "scrolltoplaying" ) {
						DOM_BODY.classList.toggle( "scroll_to_playing", trg.checked );
						removeFocussed();
						showPlaying();
					} else if ( nme === "smoothscrolling" ) {
						DOM_PLAYPEN.classList.toggle( "smooth_scrolling", trg.checked );
					}
				} else if ( typ === "radio" ) {
					if ( nme === "endof" && ( vlu === "world" || vlu === "list" ) ) {
						DOM_CONTROLS.dataset.endof = vlu;
					}
				}
				toggleOptionsVisibility();
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
					} else if ( global__queue.length ) {
						shuffle = confirm( "Shuffle the entire resultant queue?" );
					}
				}
				if ( !fltrd.length ) return;
				if ( isCtrlVlu( "clicky", "end" ) ) {
					global__queue = global__queue.concat( fltrd );
				} else {
					global__queue = fltrd.concat( global__queue );
				}
				if ( shuffle ) {
					shuffleArray( global__queue );
				}
				updateQueuetness();
			}
		}
	},

	importFiles = evt => {
		debugMsg( "importFiles:", evt );
		let slv = String.raw`${DOM_SOURCES.libraries.value}`,
			libnme = DOM_SOURCES.lib_name.value,
			libpth = DOM_SOURCES.lib_path.value,
			trg = evt.target;
		if ( slv ) {
			DOM_SOURCES.lib_name.value = DOM_SOURCES.lib_path.value = "";
			DOM_SOURCES.include.disabled = false;
			DOM_SOURCES.new_lib.disabled = true;
		} else {
			DOM_SOURCES.new_lib.disabled = false;
			DOM_SOURCES.include.disabled = !( libnme && libpth );
		}
		if ( trg === DOM_SOURCES.include ) {
			if ( slv ) {

				// TODO validate pathiness

				libnme = DOM_SOURCES.libraries.querySelectorAll( "option" )[ DOM_SOURCES.libraries.selectedIndex ].textContent;
			} else {
				slv = String.raw`${DOM_SOURCES.lib_path.value}`;
			}
			let sp = slv.split( /\\|\//g ).filter( f => f ),
				paths = arrayFrom( trg.files ).filter( file => /^audio\//.test( file.type ) ).map( file => {
					let cp = sp.concat( file.webkitRelativePath.split( "/" ).filter( f => f ) );
					return {
						"a": cp.map( pp => encodeURIComponent( pp ) ).join( "/" ), // TODO reduce paths object size
						"f": cp.pop(),
						"d": cp.slice( sp.length + 1 ).join( " | " ),
						"i": ++global__track_id
					};
				} );
			if ( paths.length ) {
				chrome.storage.local.get( async store => {
					paths = await pathsToPlaylist( paths, store.paths );
					if ( paths.length ) {

						// TODO only if something new is actually being added

						// TODO offer to store even if all the paths were already included in DOM_PLAYLIST

						// TODO provide some kind of progress indicator

						TRANSPORT.playTrack();
						if ( confirm( "Remember these files for automatic inclusion in future?" ) ) {
							let nl = { "lib_path": slv, "lib_name": libnme },
								libraries = ( store.libraries || [] ).filter( l => l.lib_path !== nl.lib_path ).concat( [ nl ] ); // TODO uniqueness must include selected folder
							setLibraries( libraries );
							chrome.storage.local.set( { "libraries": libraries, "paths": paths } );

							// TODO sophisticate
								// new Promise( resolve => chrome.storage.local.getBytesInUse( bytes => resolve( chrome.storage.local.QUOTA_BYTES - bytes ) ) )
/*
chrome.storage.local.getBytesInUse( bytes => {
	let quota = chrome.storage.local.QUOTA_BYTES;
	console.log( `Quota: ${quota}, Bytes in use: ${bytes}, Difference: ${quota - bytes}` );
} );
*/
								// giveFile()
								// JSON.stringify etc.
						}
					}
				} );
			}
			DOM_SOURCES.reset(); // TODO is kind of annoying
			DOM_SOURCES.new_lib.disabled = false;
			DOM_SOURCES.include.disabled = true;
		}
	},

	mousedownPlaylist = evt => {
		debugMsg( "mousedownPlaylist:", evt );

		// TODO all DOM_PLAYLIST click actions in DOM_LIST_EDITOR too?

		let btn = evt.button;

		if ( btn === 0 ) {
			let trg = ( evt.trg || liFromEvtPath( evt ) );
			if ( trg ) {
				let cv = ctrlVlu( "clicky" ),
					ctrl = evt.ctrlKey,
					meta = evt.metaKey,
					alt = evt.altKey,
					tia = trg.tracks;

				if ( ctrl ) {
					if ( meta ) {
						if ( alt ) {
							cv = "delist";
						} else {
							cv = "next";
						}
					} else if ( alt ) {
						cv = "end";
					} else {
						cv = "now";
					}
				} else if ( meta && alt ) {
					cv = "sequence";
				}

				if ( tia ) {
					global__queue = global__queue.filter( li => !~tia.indexOf( li ) );
				} else {
					if ( cv === "sequence" ) {

						// TODO why not whole folders?

						// TODO what happens if a track is part of more than one sequence?

						if ( !sequenced( trg ) ) {
							global__sequence.push( trg );
							updateSequences();
						}

						// TODO sequence editor

						return;
					}

					let qp = global__queue.indexOf( trg );
					if ( ~qp ) {
						global__queue.splice( qp, 1 );
					}
				}

				// TODO only allow queuing of one track from a sequence [unless ctrlChckd( "ignoresequences" )]?

				// TODO if ( DOM_CONTROLS.shuffle etc ) offer to shuffle before adding folders to the queue?

				// TODO when a sequenced track is removed from the DOM_PLAYLIST, the respective sequence needs to be adjusted or deleted

				// TODO delisting a playing folder (possibly track too) results in the continuing play of removed tracks

				if ( cv === "delist" ) {

					// TODO do something about this; it sucks

					if ( confirm( `Remove this ${tia ? "folder" : "track"} from the playlist?` ) ) {
						if ( confirm( "Do not automatically include in future?" ) ) { // TODO reduce paths object size
							chrome.storage.local.get( store => chrome.storage.local.set( { "paths": store.paths.filter( sp => ( tia ? !tia.some( li => sp.a === trackAbsPath( li ) ) : sp.a !== trackAbsPath( trg ) ) ) } ) );
						}
						if ( ( tia && ~tia.indexOf( global__current_playing_track ) ) || trg === global__current_playing_track ) {
							TRANSPORT.nextTrack();
						}
						if ( tia ) {
							global__played = global__played.filter( li => !~tia.indexOf( li ) );
							trg.folder.remove();
						} else {
							global__played = global__played.filter( li => li !== trg );
							trg.remove();
						}
						updatePlaylistLength();
						updatePlayedness();
					}
				} else if ( cv === "now" ) {

					// TODO play immediately doesn't if the player is stopped; should it?

					if ( tia ) {
						global__queue = tia.concat( global__queue );
					} else {
						if ( trg === global__current_playing_track ) {
							TRANSPORT.backTrack();
							return;
						}
						global__queue.unshift( trg );
					}
					TRANSPORT.nextTrack();
				} else if ( cv === "next" ) {
					if ( tia ) {
						global__queue = tia.concat( global__queue );
					} else {
						global__queue.unshift( trg );
					}
				} else if ( cv === "end" ) {
					if ( tia ) {
						global__queue = global__queue.concat( tia );
					} else {
						global__queue.push( trg );
					}
				}
				updateQueuetness();
			}
		} else if ( btn === 2 ) {
			if ( !debugging ) {
				let trg = liFromEvtPath( evt );
				if ( trg ) {
					evt.preventDefault();
					googleSearch( trg );
				}
			}
		}
	},

	keyDown = evt => {
		debugMsg( "keyDown:", { "evt": evt, "key": evt.key } );
		let k = evt.key,
			arrw = /^Arrow/.test( k );
		if ( !listEditorShowing() && !playlistFilterShowing() && /^(Arrow|Page)(Up|Down)$/.test( k ) ) {

			// TODO make it work with filtered and listEditor

			let hpp = halfPlaypen(),
				all = fromPlaylist[ arrw ? "tracks" : "folders" ].all(),

				// TODO if the global__current_playing_track or global__current_playing_folder are in view, use those as our kicking off point

				fcs = removeFocussed() || cloneOf( all ).sort( ( a, b ) => ( a.offsetTop - hpp ) + ( b.offsetTop - hpp ) )[ 0 ];
			evt.preventDefault();
			if ( fcs ) {
				let up = /Up$/.test( k );
				if ( arrw && folderStruct( fcs ) ) {
					if ( up ) {
						fcs = notPop( tracksOfFolder( fcs.previousElementSibling ) );
					} else {
						fcs = tracksOfFolder( fcs, 0 );
					}
				} else if ( !arrw && !folderStruct( fcs ) ) {
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
				if ( !folderStruct( fcs ) ) {
					folderOfTrack( fcs ).classList.add( "focussed_folder" );
				}
				fcs.classList.add( "focussed" );
				showPlaying();
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
						if ( evt.altKey ) {
							if ( arrayExistsAndHasLength( global__sequence ) ) {
								evt.preventDefault();
								CONTROLS.sequencify();
							}
						} else {
							TRANSPORT.stopTrack();
						}
						break;
					}
					case "q": {
						CONTROLS.listEditor( global__queue );
						break;
					}
					case "p": {
						if ( evt.altKey ) {
							if ( playingPlayed() ) {
								evt.preventDefault();
								CONTROLS.stopPlayingPlayed();
							}
						} else {
							CONTROLS.listEditor( global__played );
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
							mousedownPlaylist( { "button": 0, "trg": folder( fcs ), "ctrlKey": evt.ctrlKey, "metaKey": evt.metaKey, "altKey": evt.altKey } );
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

	storeSettings = () => {
		if ( !user_reset ) {
			chrome.storage.local.set( {
				"played": trackIDs( global__played ),
				"queue": trackIDs( global__queue ),
				"settings": {
					displaycontrols: DOM_CONTROLS.switchControls.value,
					ignoresequences: ctrlChckd( "ignoresequences" ),
					scrolltoplaying: ctrlChckd( "scrolltoplaying" ),
					smoothscrolling: ctrlChckd( "smoothscrolling" ),
					softstop: DOM_CONTROLS.soft_stop.valueAsNumber,
					volume: DOM_CONTROLS.volume.valueAsNumber,
					skiplayed: ctrlChckd( "skiplayed" ),
					shuffleby: ctrlVlu( "shuffleby" ),
					endof: DOM_CONTROLS.dataset.endof,
					shuffle: ctrlChckd( "shuffle" ),
					clicky: ctrlVlu( "clicky" )
				}
			} );
		}
	},

	applySettings = settings => {
		return new Promise( resolve => {
			let sttngs = Object.assign( {
				displaycontrols: "LEFT", // flipped by logic
				ignoresequences: false,
				scrolltoplaying: true,
				smoothscrolling: true,
				shuffleby: "track",
				skiplayed: true,
				endof: "world",
				shuffle: true,
				clicky: "end",
				softstop: 0,
				volume: 0.5
			}, settings || {} );

			// TODO reduce repeated code

			DOM_BODY.classList.toggle( "display_controls_left", ( DOM_CONTROLS.switchControls.value = sttngs.displaycontrols ) === "RIGHT" );
			DOM_CONTROLS.smoothscrolling.checked = DOM_PLAYPEN.classList.toggle( "smooth_scrolling", sttngs.smoothscrolling );
			DOM_CONTROLS.scrolltoplaying.checked = DOM_BODY.classList.toggle( "scroll_to_playing", sttngs.scrolltoplaying );
			DOM_CONTROLS.soft_stop.parentElement.dataset.op = ( DOM_CONTROLS.soft_stop.value = sttngs.softstop ) * 0.001;
			DOM_AUDIO.volume = DOM_CONTROLS.volume.value = DOM_CONTROLS.volume.parentElement.dataset.op = sttngs.volume;
			DOM_CONTROLS.dataset.endof = DOM_CONTROLS.endof.value = sttngs.endof;
			DOM_CONTROLS.ignoresequences.checked = sttngs.ignoresequences;
			DOM_CONTROLS.skiplayed.checked = sttngs.skiplayed;
			DOM_CONTROLS.shuffleby.value = sttngs.shuffleby;
			DOM_CONTROLS.shuffle.checked = sttngs.shuffle;
			DOM_CONTROLS.clicky.value = sttngs.clicky;
			toggleOptionsVisibility();
			resolve( true );
		} );
	};

window.addEventListener( "keydown", keyDown );
window.addEventListener( "beforeunload", storeSettings, { passive: true } );

DOM_AUDIO.addEventListener( "error", trackError, { passive: true } );
DOM_AUDIO.addEventListener( "ended", trackEnded, { passive: true } );
DOM_AUDIO.addEventListener( "timeupdate", trackTimeUpdate, { passive: true } );
DOM_AUDIO.addEventListener( "loadedmetadata", setTrackDuration, { passive: true } );

DOM_SOURCES.addEventListener( "input", importFiles, { passive: true } );

DOM_CONTROLS.addEventListener( "input", inputControls, { passive: true } );
DOM_CONTROLS.addEventListener( "click", clickControls );

DOM_SEEK.addEventListener( "input", seekTrack, { passive: true } );

DOM_PLAYLIST.addEventListener( "mousedown", mousedownPlaylist );

DOM_PLAYLIST_FILTER.addEventListener( "input", inputPlaylistFilter, { passive: true } );
DOM_PLAYLIST_FILTER.addEventListener( "click", clickPlaylistFilter, { passive: true } );

DOM_LIST_EDITOR.addEventListener( "click", clickListEditor, { passive: true } );
DOM_LIST_EDITOR.addEventListener( "dragstart", dragStart, { passive: true } );
DOM_LIST_EDITOR.addEventListener( "dragend", dragEnd, { passive: true } );
DOM_LIST_EDITOR.querySelectorAll( ".dropzone" ).forEach( dz => {
	dz.addEventListener( "dragover", dragOver );
	dz.addEventListener( "drop", drop );
} );

chrome.storage.local.get( store => {
	setLibraries( store.libraries );
	applySettings( store.settings ).then( t => {
		pathsToPlaylist( store.paths ).then( t => {
			mindTheStore( store ).then( t => {
				TRANSPORT.playTrack();
			} );
		} );
	} );
} );
