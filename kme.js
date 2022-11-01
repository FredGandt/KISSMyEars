
/* TODO review todo notes

navigation (back, next etc) of tracks while a sequence is playing is flat out broken

if shuffleBy( "folder" ) && queue created; option to finish the folder first, play the queue then come back to the folder, or simply move on

include image files (which might be cover art, but could also be dick-pics) in uploads and display

sequencify folders for isShuffleBy( "folder" ) i.e. disc 1 & 2 of double album

temporary ignorables during not shuffled play e.g. skip tracks this time
	break at marker?

disable marking queued tracks as played during otherwise shuffled play

repeat track, folder, sequence, queue (or playlist when implemented)

queue stuff to follow the folder playing during shuffle by folder

remake "played after" functionality using percentage played

start shuffle play again after e.g. finishing a folder etc.

select specific album to play during shuffle by folder

skip sequence button (instead of next next next...)

mark folders to be ignored during shuffle by folder
	without being marked as  played

mark newly added tracks and make them easy to find

mark tracks/folders to "never mark as played"

mark track to stop at; when queued and ????

display GLOBAL.played most recent at top?

gapless playback (surprisingly shitty)

show recently added button; filter?

prioritise UX for visually impaired

playing played sequenced tracks...
________________________________________________________________________________

sequence editing
	add tracks to or remove tracks from established sequences
	alter the order of tracks in a sequence
	combine or split sequences
	delete sequences

fix responsiveness of UI
	window.devicePixelRatio
	window.matchMedia()
	css max() & min()

merge new imports into related folders
	CONTROLS.fixBreakages()

save queue as playlist
	giveFile()
________________________________________________________________________________

tags
	https://taglib.org/api/
	https://pypi.org/project/pytaglib/
	https://en.wikipedia.org/wiki/TagLib
	https://developer.mozilla.org/en-US/docs/WebAssembly
	https://emscripten.org/docs/getting_started/Tutorial.html
		organise playback by tag
		sorting and searching
		tag-embedded images
		merging uploads
		replaygain
			https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
			https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
		scrobbling
			https://www.last.fm/api/scrobbling
________________________________________________________________________________

maybe
	use virtual DOM for DOM_PLAYLIST
	indexedDB instead of localStorage
	skip silent sections in tracks e.g. leading to hidden tracks.
		https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
		https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode

*/

"use strict";

let debugging = false;

function FromPlaylist() {
	this.get = ( qs, not_ignorable ) => arrayFrom( DOM_PLAYLIST.querySelectorAll( `${qs}${not_ignorable ? ':not([data-ignorable="?"])' : ""}` ) );

	this.tracks = {
		sequence: () => this.get( 'ol li[data-sequence^="NEW"]:not(.broken)' ),
		sequenced: () => this.get( 'ol li[data-sequence*=":"]:not(.broken)' ), // TODO is this being used?
		ignorable: () => this.get( 'ol li[data-ignorable="?"]:not(.broken)' ),
		queue: () => this.get( 'ol li[data-queue*="/"]:not(.broken)' ),

		filtered: ni => this.get( 'ol li.filtered:not(.broken, [data-queue*="/"])', ni ),
		notPlayed: ni => this.get( "ol li:not(.broken, .played)", ni ),
		played: () => this.get( "ol li.played:not(.broken)" ),
		all: ni => this.get( "ol li:not(.broken)", ni ),
		broken: () => this.get( "ol li.broken" ),

		ofPlayedFolders: ( pld, ni ) => this.get( `li[data-folder_struct].played li${pld ? ".played" : ""}:not(.broken)`, ni )
	};

	this.folders = {
		notPlayed: ni => this.get( "li[data-folder_struct]:not(.played)", ni ), // TODO ignorable folders
		played: () => this.get( "li[data-folder_struct].played" ),
		all: ni => this.get( "li[data-folder_struct]", ni )
	};

	this.focussed = () => notPop( this.get( "li.focussed:not(.broken)" ) );
	this.filtered = () => this.get( "li.filtered:not(.broken)" );
	this.played = () => this.get( "li.played:not(.broken)" );
};

const BROWSER = window.hasOwnProperty( "browser" ) ? browser : chrome,
	STORAGE = BROWSER.storage.local,

	DOM_LIST_EDITOR_CONTEXT_MENU = document.getElementById( "list_editor_context_menu" ),
	DOM_PLAYLIST_CONTEXT_MENU = document.getElementById( "playlist_context_menu" ),
	DOM_PLAYLIST_FILTER = document.getElementById( "playlist_filter" ),
	DOM_LIST_EDITOR = document.getElementById( "list_editor" ),
	DOM_PLAYLIST = document.getElementById( "playlist" ),
	DOM_CONTROLS = document.getElementById( "controls" ),
	DOM_WELCOME = document.getElementById( "welcome" ),
	DOM_SOURCES = document.getElementById( "sources" ),
	DOM_SEEK = document.getElementById( "seek" ),
	DOM_SPP = document.getElementById( "spp" ),

	DOM_LIST_EDITOR_TRASH = DOM_LIST_EDITOR.querySelector( "div" ),
	DOM_LIST_EDITOR_LIST = DOM_LIST_EDITOR.querySelector( "ol" ),
	DOM_AUDIO = document.querySelector( "audio" ),
	DOM_PLAYPEN = DOM_PLAYLIST.parentElement,
	DOM_BODY = document.body,

	DOM_TEMPLATES = {
		playlist_filter: document.getElementById( "playlist_filter_template" ).content.firstElementChild,
		folder: document.getElementById( "folder_template" ).content.firstElementChild
	},

	GLOBAL = {
		current_playing_folder: undefined,
		current_playing_track: undefined,
		playlist_fragment: undefined,
		dragee: undefined,

		played_index: null,
		preference: null,

		sequence_end: false,
		queue_end: false,
		softstop: false,

		track_id: 0,

		preferences: {},

		track_sequence: [],
		ignorable: [],
		sequences: [],
		sequence: [],
		played: [],
		queue: []
	},

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

	plus1 = n => n + 1,

	minus1 = n => n - 1,

	half = n => n * 0.5,

	notPop = arr => arr.slice( -1 )[ 0 ],

	arrayFrom = lst => Array.from( lst ),

	cloneArray = arr => [].concat( arr ),

	isBtn = trg => trg?.type === "button",

	ctrlVlu = ctrl => DOM_CONTROLS[ ctrl ].value,

	trackFromId = id => tracksFromIds( id )[ 0 ],

	underspace = str => str.replace( /_+/g, " " ),

	randNum = n => Math.floor( Math.random() * n ),

	arrayOf = ( ...lmnts ) => Array.of( ...lmnts ),

	trackPath = li => getElementData( li, "path" ),

	untilEndOf = cont => isCtrlVlu( "endof", cont ),

	ctrlChckd = ctrl => DOM_CONTROLS[ ctrl ].checked,

	isShuffleBy = sb => isCtrlVlu( "shuffleby", sb ),

	resetTrackTime = () => DOM_AUDIO.currentTime = 0,

	isPlayed = li => li.classList.contains( "played" ),

	isCtrlVlu = ( ctrl, vlu ) => ctrlVlu( ctrl ) === vlu,

	folderOfTrack = li => li.parentElement.parentElement,

	displayBrightness = bn => DOM_BODY.style.opacity = bn,

	folderFromStruct = fs => foldersFromStructs( fs )[ 0 ],

	fltrChckd = ctrl => DOM_PLAYLIST_FILTER[ ctrl ].checked,

	getElementData = ( lmnt, data ) => lmnt?.dataset[ data ],

	trackIgnorable = li => getElementData( li, "ignorable" ),

	pathsMatch = ( a, b ) => trackPath( a ) === trackPath( b ),

	folderStruct = li => getElementData( li, "folder_struct" ),

	clearlistEditor = () => DOM_LIST_EDITOR_LIST.innerHTML = "",

	tagIs = ( lmnt, tag ) => lmnt?.tagName?.toLowerCase() === tag,

	folderStructOfTrack = li => folderStruct( folderOfTrack( li ) ),

	numberOfNotBrokenTracks = () => fromPlaylist.tracks.all().length,

	markSequenced = ( li, sq ) => setElementData( li, "sequence", sq ),

	isNewSequenced = li => /^NEW/.test( getElementData( li, "sequence" ) ),

	resetVolume = () => DOM_AUDIO.volume = DOM_CONTROLS.volume.valueAsNumber,

	halfPlaypen = () => DOM_PLAYPEN.scrollTop + half( DOM_PLAYPEN.offsetHeight ),

	multiTrack = ( n, tof ) => `${n} ${tof ? tof : "TRACK"}${n !== 1 ? "S" : ""}`,

	cleanTitle = () => document.title.replace( /^(?:\[(?:PAUS|STOPP)ED\] )+/, "" ),

	playingPlayed = () => DOM_SPP.classList.toggle( "show", GLOBAL.played_index ),

	playlistFilterShowing = () => DOM_PLAYLIST_FILTER.classList.contains( "show" ),

	markUnplayed = ( ...lis ) => lis.forEach( li => li.classList.remove( "played" ) ),

	contextMenuShowing = () => DOM_PLAYLIST_CONTEXT_MENU.classList.contains( "show" ),

	setOp = ( ctrl, op ) => setElementData( DOM_CONTROLS[ ctrl ].parentElement, "op", op ),

	playingSequence = () => GLOBAL.track_sequence.length && ctrlChckd( "respectsequences" ),

	folder = li => folderStruct( li ) ? { "folder": li, "tracks": tracksOfFolder( li ) } : li,

	idsFromTracks = ( ...lis ) => lis.map( li => getElementData( li, "id" ) || folderStruct( li ) ), // TODO reduce paths object size

	tracksFromIds = ( ...ids ) => ids.map( id => DOM_PLAYLIST.querySelector( `li[data-id="${id}"]` ) ),

	// TODO maintain "[STOPPED/PAUSED]" prefix if nexting from stopped
	setTitle = ( ttl, pp ) => document.title = ttl ? ttl + ( pp ? ` ${cleanTitle()}` : "" ) : cleanTitle(),

	scrubTrackMarkers = mrkr => fromPlaylist.tracks[ mrkr ]().forEach( li => setElementData( li, mrkr, "" ) ),

	setLibraries = libs => DOM_SOURCES.libraries.innerHTML = '<option value="" selected>ADD NEW LIBRARY</option>' +
		libs?.map( l => `<option value="${l.lib_path}" title="${l.lib_path}">${l.lib_name}</option>` ).join( "" ) ?? "",

	foldersFromStructs = ( ...fss ) => fss.map( fs => DOM_PLAYLIST.querySelector( `li[data-folder_struct="${fs}"]` ) ),

	lst2Arr = lst => lst === "folders" ? fromPlaylist.tracks.ofPlayedFolders() : ( lst === "queue" ? GLOBAL.queue : GLOBAL.played ),

	sortPlaylist = () => DOM_PLAYLIST.append( ...fromPlaylist.folders.all().sort( ( a, b ) => collator.compare( folderStruct( a ), folderStruct( b ) ) ) ),

	TRANSPORT = {
		backTrack: () => {
			endSoftStop();
			resetTrackTime();
			if ( DOM_AUDIO.paused && ctrlChckd( "wakeful" ) ) {
				DOM_AUDIO.play();
				setTitle();
			}
		},

		nextTrack: prev => {
			let paused = DOM_AUDIO.paused;
			endSoftStop();
			TRANSPORT.stopTrack( true );
			if ( !prev && playingPlayed() ) {
				++GLOBAL.played_index;
			}
			if ( playingSequence() && ctrlChckd( "sequenceprevnext" ) ) {
				clear( "track_sequence" );
			}
			if ( paused && !ctrlChckd( "wakeful" ) ) {
				selectNext( prev );
			} else {
				TRANSPORT.playTrack( prev );
			}
		},

		playTrack: prev => {
			endSoftStop();
			selectNext( prev ).then( t => {
				if ( DOM_AUDIO.src && DOM_AUDIO.paused ) {
					DOM_AUDIO.play();
					setTitle();
				}
			} );
		},

		pawsTrack: () => {
			endSoftStop();
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
			// an overide is needed when suffle is off, so rather than previously played, it selects the previous track in the DOM_PLAYLIST
			// going to a previous track during a queue should requeue the track you've just ignored i.e. maintain the queue

		prevTrack: () => {
			let pl = GLOBAL.played.length;
			endSoftStop();
			if ( pl ) {
				if ( playingPlayed() && Math.abs( GLOBAL.played_index ) < pl ) {
					--GLOBAL.played_index;
				} else {
					GLOBAL.played_index = -1;
				}
			}
			TRANSPORT.nextTrack( true );
		},

		stopTrack: async rs => {
			if ( DOM_AUDIO.src ) {
				let fade = DOM_CONTROLS.softstop.valueAsNumber;
				if ( !rs && fade && DOM_AUDIO.volume ) {
					if ( !GLOBAL.softstop ) {
						await softStop( fade );
					} else {
						softStopEnd();
					}
				}
				DOM_AUDIO.pause();
				resetVolume();
				resetTrackTime();
				if ( rs ) {
					DOM_AUDIO.removeAttribute( "src" );
				} else {
					setTitle( "[STOPPED]", true );
				}
			}
		},

		prevFolder: () => {
			endSoftStop();
			GLOBAL.current_playing_folder = folderOfTrack( cloneArray( GLOBAL.played ).reverse().find( trck => folderOfTrack( trck ) !== GLOBAL.current_playing_folder ) );
			TRANSPORT.nextTrack();
		},

		backFolder: () => {
			endSoftStop();
			GLOBAL.current_playing_track = null;
			TRANSPORT.nextTrack();
		},

		// TODO allow next and back folder when not shuffle playing?

		nextFolder: () => {
			endSoftStop();
			GLOBAL.current_playing_folder = null;
			TRANSPORT.nextTrack();
		}
	},

	CONTROLS = {

		fixBreakages: () => debugMsg( "fixBreakages:", fromPlaylist.tracks.broken(), "warn" ), // TODO all the things

		addTracks: () => {
			DOM_SOURCES.pffs.disabled = !DOM_SOURCES.classList.toggle( "show" );
			DOM_SOURCES.libraries.focus();
		},

		switchControls: () => {
			let sc = DOM_CONTROLS.switchControls;
			sc.value = DOM_BODY.classList.toggle( "display_controls_left", sc.value === "LEFT" ) ? "RIGHT" : "LEFT";
		},

		sequencify: () => {
			if ( GLOBAL.sequence.length ) {
				GLOBAL.sequences.push( idsFromTracks( ...GLOBAL.sequence ) );
				clear( "sequence" );
			}
		},

		stopPlayingPlayed: () => {
			GLOBAL.played_index = null;
			if ( confirm( "After this track?" ) ) {
				GLOBAL.current_playing_track = null;
			} else {
				TRANSPORT.nextTrack();
			}
		},

		playlistFilter: () => {
			if ( numberOfNotBrokenTracks() ) {
				if ( DOM_PLAYLIST_FILTER.classList.toggle( "show" ) ) {
					DOM_PLAYLIST_FILTER.pffs.disabled = false;
					DOM_PLAYLIST_FILTER.querySelector( 'input[name="contains"]' ).focus();
					if ( listEditorShowing() ) {
						listEditorClick();
					}
					return;
				}
			}
			closePlaylistFilter();
		},

		listEditor: lst => {

			// TODO sequence editing

			let les = listEditorShowing();
			if ( les === lst ) {
				listEditorClick();
			} else {
				if ( les ) {
					clearlistEditor();
				}
				let arr = lst2Arr( lst );
				if ( arr.length ) {
					if ( playlistFilterShowing() ) {
						closePlaylistFilter();
					}
					appendClones2ListEditor( arr );
					setElementData( DOM_LIST_EDITOR, "list", lst );
					DOM_LIST_EDITOR.classList.add( "show" );
					DOM_LIST_EDITOR.pffs.disabled = false;
					DOM_LIST_EDITOR.done.focus();
				}
			}
		},

		clearPlaylist: () => {
			STORAGE.get( store => {
				if ( store.paths?.length && confirm( `Clear the playlist?
All markers and list assignments will also be cleared.
THESE ACTIONS CANNOT BE UNDONE!` ) ) {
					TRANSPORT.stopTrack( true );
					let tds = DOM_CONTROLS.times.dataset;
					tds.dura = tds.rema = seconds2Str();

					setTitle( "KISS My Ears" );

					DOM_PLAYLIST.innerHTML = "";
					updatePlaylistLength();

					clear( "track_sequence" );
					clear( "sequences" );
					clear( "sequence" );
					updateSequences();

					clear( "ignorable" );
					updateIgnorables();

					clear( "played" );
					updatePlayedness();

					clear( "queue" );
					updateQueuetness();

					STORAGE.remove( arrayOf( "paths", "queue", "played", "sequences", "ignorable" ) );
				}
				if ( store.libraries?.length && confirm( "Clear the stored libraries?" ) ) {
					setLibraries();
					STORAGE.remove( "libraries" );
				}
				if ( store.settings && confirm( "Clear all settings and reload the player?" ) ) {
					STORAGE.remove( "settings" );
					location.reload();
				}
			} );
		}
	},

	setDefaultEndOf = () => {
		DOM_CONTROLS.endof.value = getElementData( DOM_CONTROLS, "defaultendof" );

		// TODO move the focus too?

		saveSettings();
	},

	endSoftStop = () => {
		if ( GLOBAL.softstop ) {
			softStopEnd();
			resetVolume();
		}
	},

	softStopEnd = () => {
		clearInterval( GLOBAL.softstop );
		GLOBAL.softstop = false;
		DOM_AUDIO.volume = 0;
	},

	setElementData = ( lmnt, data, vlu ) => {
		if ( lmnt ) {
			lmnt.dataset[ data ] = vlu;
		}
		return vlu;
	},

	shuffleArray = arr => {
		arr.forEach( ( r, i ) => {
			r = randNum( plus1( i ) );
			[ arr[ i ], arr[ r ] ] = [ arr[ r ], arr[ i ] ];
		} );
	},

	removeFocussed = () => {
		let fcs = fromPlaylist.focussed();
		if ( fcs ) {
			fcs.classList.remove( "focussed" );
			return fcs;
		}
		return null;
	},

	refreshListEditor = lst => { // TODO update folders editor
		lst = lst2Arr( lst || listEditorShowing() );
		if ( lst.length ) {
			clearlistEditor();
			appendClones2ListEditor( lst );
		} else {
			listEditorClick();
		}
	},

	listEditorShowing = lst => {
		if ( DOM_LIST_EDITOR.classList.contains( "show" ) ) {
			let ledl = getElementData( DOM_LIST_EDITOR, "list" );
			if ( !lst || ( lst && ledl === lst ) ) {
				return ledl;
			}
		}
		return false;
	},

	clearFilters = done => {
		if ( done ) {
			DOM_PLAYLIST.classList.remove( "filtered" );
		}
		fromPlaylist.filtered().forEach( li => li.classList.remove( "filtered" ) );
	},

	// TODO combine the shit out of this shit

	clearQueueOf = ( arr, shave ) => { // NOTE: "defer" -> "de-fur" -> "shave"
		GLOBAL.queue = GLOBAL.queue.filter( li => !~arr.indexOf( li ) );
		if ( !shave ) {
			updateQueuetness();
		}
	},

	clearPlayedOf = ( arr, shave ) => {
		GLOBAL.played = GLOBAL.played.filter( li => !~arr.indexOf( li ) );
		if ( !shave ) {
			updatePlayedness();
		}
	},

	clearSequenceOf = ( arr, shave ) => {
		GLOBAL.sequence = GLOBAL.sequence.filter( li => !~arr.indexOf( li ) );
		if ( !shave ) {
			updateSequences();
		}
	},

	clearIgnorablesOf = ( arr, shave ) => {
		GLOBAL.ignorable = GLOBAL.ignorable.filter( li => !~arr.indexOf( li ) );
		if ( !shave ) {
			updateIgnorables();
		}
	},

	// TODO combine the shit out of those shits

	scroll2Track = ( frc = !GLOBAL.sequence.length && !playlistFilterShowing() && !contextMenuShowing() ) => {

		// TODO isShuffleBy( "folder" )?

		if ( frc ) {
			let fcs = fromPlaylist.focussed();
			if ( fcs || ( GLOBAL.current_playing_track && ctrlChckd( "scrolltoplaying" ) ) ) {
				requestIdleCallback( () => DOM_PLAYPEN.scrollBy( 0, ( fcs || GLOBAL.current_playing_track ).offsetTop - DOM_PLAYPEN.offsetTop - halfPlaypen() ) );
			}
		}
	},

	softStop = fs => {

		// TODO subtle as having your brains smashed out with a slice of lemon wrapped round a large gold brick

		return new Promise( resolve => {
			let sov = DOM_AUDIO.volume / ( fs * 100 );
			GLOBAL.softstop = setInterval( () => {
				if ( ( DOM_AUDIO.volume -= sov ) <= sov ) {
					softStopEnd();
					resolve( true );
				}
			}, 10 );
		} );
	},

	closePlaylistFilter = () => {
		DOM_PLAYLIST_FILTER.classList.remove( "show" );
		DOM_PLAYLIST_FILTER.pffs.disabled = true;
		document.activeElement.blur();
		DOM_PLAYLIST_FILTER.reset();
		clearFilters( true );
		scroll2Track();
	},

	tracksOfFolder = ( fldr, trck ) => {
		if ( fldr ) {
			let trcks = fldr.firstElementChild?.children;
			if ( trcks?.length ) {
				if ( typeof trck === "number" ) {
					return trcks[ trck ];
				}
				return arrayFrom( trcks );
			}
		}
		return [];
	},

	googleSearch = ( li, rtq ) => {
		if ( navigator.onLine ) {
			let query;
			if ( typeof li === "string" ) {
				query = li;
			} else if ( li = folder( li || fromPlaylist.focussed() ) ) {
				query = li.folder ? folderStruct( li.folder ) : `${folderStructOfTrack( li )} | ${getElementData( li, "title" )}`;
			}
			if ( rtq ) {
				return query;
			}

			// TODO with tags; track search should be `"${artist}" "${title}"`
				// scrobbling etc.

			if ( query ) {
				BROWSER.tabs.create( { "url": `https://www.google.com/search?q=${encodeURIComponent( query )}`, "active": true } );
			}
		}
	},

	clear = arr => {
		switch ( arr ) {
			case "queue": {
				GLOBAL.queue = [];
				updateQueuetness();
				break;
			}
			case "played": {
				GLOBAL.played = [];
				updatePlayedness();
				break;
			}
			case "sequence": {
				GLOBAL.sequence = [];
				updateSequences();
				break;
			}
			case "sequences": {
				GLOBAL.sequences = [];
				updateSequences();
				break;
			}
			case "ignorable": {
				GLOBAL.ignorable = [];
				updateIgnorables();
				break;
			}
			case "track_sequence": {
				GLOBAL.track_sequence = [];
				break;
			}
		}
	},

	updatePreferences = () => {
		for ( const [ k, v ] of Object.entries( GLOBAL.preferences ) ) {
			( parseInt( k ) ? trackFromId : folderFromStruct )( k ).classList.add( "unpref" );
			( parseInt( v ) ? trackFromId : folderFromStruct )( v ).classList.add( "pref" );
		}
	},

	updateIgnorables = () => {
		let il = GLOBAL.ignorable.length;
		STORAGE.set( { "ignorable": idsFromTracks( ...GLOBAL.ignorable ) } );
		scrubTrackMarkers( "ignorable" );
		GLOBAL.ignorable.forEach( li => setElementData( li, "ignorable", "?" ) );
	},

	updatePlaylistLength = () => {
		let atl = numberOfNotBrokenTracks(),
				btl = fromPlaylist.tracks.broken().length,
				pllds = DOM_CONTROLS.playlist_length.dataset;
		pllds.tracks = multiTrack( atl );
		pllds.broken = btl ? ` + ${btl} BROKEN` : "";
		DOM_CONTROLS.fixBreakages.classList.toggle( "show", btl ); // TODO CONTROLS.fixBreakages()
		pllds.folders = multiTrack( fromPlaylist.folders.all().length, "FOLDER" );
	},

	updateQueuetness = rfrsh => {
		let ql = GLOBAL.queue.length;
		STORAGE.set( { "queue": idsFromTracks( ...GLOBAL.queue ) } );
		scrubTrackMarkers( "queue" );
		if ( DOM_CONTROLS.classList.toggle( "show_cont_queue", ql ) ) {
			setElementData( DOM_CONTROLS.queue_length, "ql", multiTrack( ql ) );
			GLOBAL.queue.forEach( ( li, i ) => setElementData( li, "queue", `${plus1( i )}/${ql}` ) );
		}
		if ( rfrsh ) {
			refreshListEditor( "queue" );
		}
	},

	updateSequences = () => {
		let sl = GLOBAL.sequence.length;
		STORAGE.set( { "sequences": GLOBAL.sequences } );
		scrubTrackMarkers( "sequence" );
		if ( sl ) {
			GLOBAL.sequence.forEach( ( li, i ) => markSequenced( li, `NEW:${plus1( i )}` ) );
			if ( DOM_CONTROLS.sequence_fs.classList.toggle( "show", sl > 1 ) ) {
				setElementData( DOM_CONTROLS.sequence_length, "sl", multiTrack( sl ) );
			}
		} else {
			DOM_CONTROLS.sequence_fs.classList.remove( "show" );
			GLOBAL.sequences.forEach( ( squnc, ndx ) => tracksFromIds( ...squnc ).forEach( ( li, i ) => markSequenced( li, `${plus1( ndx )}:${plus1( i )}` ) ) );

			// TODO sequence editor
		}
	},

	updatePlayedness = () => {
		let fldr, trcks;

		// TODO stop at the end of played?

		// TODO duplications?
			// GLOBAL.played could have a length of 10 but contain only 1 track

		STORAGE.set( { "played": idsFromTracks( ...GLOBAL.played ) } );

		let les = listEditorShowing();
		if ( les === "played" || les === "folders" ) {
			refreshListEditor( les );
		}

		markUnplayed( ...fromPlaylist.played() );

		GLOBAL.played.forEach( li => {
			li.classList.add( "played" );
			fldr = folderOfTrack( li );
			if ( !fldr.querySelector( `li:not(.played${ctrlChckd( "ignoreplayedfolder" ) ? ',[data-ignorable="?"]' : ""})` ) ) {
				fldr.classList.add( "played" );
			}
		} );

		if ( DOM_CONTROLS.classList.toggle( "show_cont_played_tracks", GLOBAL.played.length ) ) {
			setElementData( DOM_CONTROLS.played_tracks_length, "pl", multiTrack( GLOBAL.played.length ) );
			let pfl = fromPlaylist.folders.played().length;
			if ( DOM_CONTROLS.classList.toggle( "show_cont_played_folders", pfl ) ) {
				setElementData( DOM_CONTROLS.played_folders_length, "pl", multiTrack( pfl, "FOLDER" ) );
			}
		}
	},

	giveFile = ( name, cntnt ) => {
		let blob = new Blob( arrayOf( cntnt ), { type: "text/plain" } ),
				ourl = URL.createObjectURL( blob ),
				a = document.createElement( "a" );
		a.href = ourl;
		a.download = name;
		DOM_BODY.append( a );
		a.click();
		a.remove();
		URL.revokeObjectURL( ourl );
	},

	// TODO handle more?

	toggleOptionsVisibility = () => {
		let dccl = DOM_CONTROLS.classList;
		if ( !dccl.toggle( "hide_shuffle_by", !ctrlChckd( "shuffle" ) ) ) {
			if ( dccl.toggle( "hide_cont_folder", ( DOM_CONTROLS.folder.disabled = !isShuffleBy( "folder" ) ) ) ) {
				if ( untilEndOf( "folder" ) ) {
					setDefaultEndOf();
				}
			}
		} else {
			dccl.remove( "hide_cont_folder" );
		}
	},

	seconds2Str = f => {
		if ( f ) {
			f = parseFloat( f );
			let seconds = f % 60,
					m = ( f - seconds ) / 60,
					minutes = m % 60,
					hours = ( m - minutes ) / 60;
			return [
				hours ? `${hours}`.padStart( 2, "0" ) : "",
				`${minutes}`.padStart( 2, "0" ),
				`${Math.floor( seconds )}`.padStart( 2, "0" )
			].filter( a => a ).join( ":" );
		}
		return "00:00";
	},

	appendClones2ListEditor = arr => {
		let fldr_strct, clone, lc, ol;
		arr.forEach( li => {
			setElementData( clone = li.cloneNode(), "folder", fldr_strct = folderStructOfTrack( li ) || "" );
			lc = DOM_LIST_EDITOR_LIST.lastElementChild;
			clone.draggable = true;
			if ( getElementData( lc, "folder" ) === fldr_strct ) {
				if ( ol = lc.firstElementChild ) {
					ol.append( clone );
				} else {
					li = DOM_TEMPLATES.folder.cloneNode( true );
					setElementData( li, "folder", fldr_strct );
					li.firstElementChild.append( lc, clone );
					DOM_LIST_EDITOR_LIST.append( li );
				}
			} else {
				DOM_LIST_EDITOR_LIST.append( clone );
			}
		} );
	},

	displayTrackData = listing => {
		if ( GLOBAL.current_playing_track ) {
			GLOBAL.current_playing_track.classList.remove( "playing" );
		}
		if ( listing ) {
			GLOBAL.current_playing_folder = folderOfTrack( GLOBAL.current_playing_track = listing );
			listing.classList.add( "playing" );
			setTitle( getElementData( listing, "title" ) );
			scroll2Track();
		} else {
			GLOBAL.current_playing_folder = GLOBAL.current_playing_track = null;
			if ( GLOBAL.played.length && confirm( "Clear the play history?" ) ) {
				clear( "played" );
				TRANSPORT.playTrack();
			} else {
				setTitle( "KISS My Ears" );
			}
		}
	},

	collection2HTML = ( folder, end ) => {

		// TODO use tags to determine fields to create

		if ( folder.tracks.length ) {
			let fldr = DOM_TEMPLATES.folder.cloneNode( true ), li;
			folder.tracks.sort( ( a, b ) => a.num - b.num ).forEach( track => {
				li = document.createElement( "li" );
				setElementData( li, "title", track.title );
				setElementData( li, "path", track.path ); // TODO reduce paths object size
				setElementData( li, "id", track.id );
				fldr.firstElementChild.append( li );
			} );
			setElementData( fldr, "folder_struct", folder.path ); // GLOBAL.preference
			setElementData( li, "last_track", true );
			GLOBAL.playlist_fragment.append( fldr );
			if ( end ) {
				DOM_PLAYLIST.append( GLOBAL.playlist_fragment );
				updatePlaylistLength();
				sortPlaylist();
			}
		}
	},

	paths2Playlist = ( paths, stored = [] ) => {
		return new Promise( resolve => {
			if ( paths?.length ) {

				// TODO reduce paths object size

				let folder = { "tracks": [], "path": "" },
						mtch, pastpath;
				GLOBAL.playlist_fragment = document.createDocumentFragment();
				paths = paths.filter( path => {
					if ( stored.some( sp => sp.a === path.a ) ) {
						return false;
					}
					if ( pastpath !== path.d ) {
						pastpath = path.d;
						collection2HTML( folder );
						folder = { "tracks": [], "path": "" };
					}
					folder.path = path.d;
					GLOBAL.track_id = Math.max( GLOBAL.track_id, path.i );
					if ( mtch = path.f.match( /^([0-9]+)?[ \-_]*(.+)\.[a-z0-9]+$/ ) ) {
						folder.tracks.push( {
							"title": underspace( mtch[ 2 ] ),
							"path": path.a,
							"num": mtch[ 1 ],
							"id": path.i
						} );
						return true;
					}
					debugMsg( "Unprocessable file name format:", path, "warn" ); // TODO what if the folder is empty?
					return false;
				} );
				collection2HTML( folder, true );
				resolve( stored.concat( paths ) );
				if ( !DOM_PLAYLIST_FILTER.querySelector( 'input[type="text"]' ) ) { // TODO derive from tags
					let fltr_prp, lgnd;
					arrayOf( "folder_struct", "title" ).forEach( col => {
						fltr_prp = DOM_TEMPLATES.playlist_filter.cloneNode( true );
						lgnd = fltr_prp.firstElementChild;
						lgnd.textContent = underspace( setElementData( lgnd, "data", col ) );
						DOM_PLAYLIST_FILTER.pffs.append( fltr_prp );
					} );
				}
			}
		} );
	},

	selectNext = prev => {
		return new Promise( resolve => {
			if ( !DOM_AUDIO.src ) {
				let listing;
				if ( playingSequence() ) {
					listing = GLOBAL.track_sequence.shift();

					// TODO if ( untilEndOf( "queue" ) && the last track of the queue is sequenced and not the last track of that sequence ) { stop at the end of the sequence }

					DOM_CONTROLS.classList.toggle( "show_cont_sequence", GLOBAL.sequence_end = !GLOBAL.track_sequence.length );

				} else {
					clear( "track_sequence" );
					let pl = GLOBAL.played.length;
					if ( pl && playingPlayed() ) {
						listing = GLOBAL.played[ pl + GLOBAL.played_index ];
					} else {
						GLOBAL.played_index = null;
						if ( GLOBAL.queue.length ) {
							listing = GLOBAL.queue.shift();

							// TODO if stop at the end of track lands here and the player is refreshed, the queue starts again at its next entry
								// a) was_queued = listing? a kind of honorary queue track to be cleared only when the track is ended or skipped
								// b) don't shift the queue here, but do it at track end? sounds complicated
								// while solving that;
									// address the crappy issue of not being able to stop at the end of the queue when the last track of the queue is playing

							GLOBAL.queue_end = !GLOBAL.queue.length;
							if ( listEditorShowing( "queue" ) ) {
								if ( GLOBAL.queue_end ) {
									listEditorClick();
								} else {
									refreshListEditor( "queue" );
								}
							}
							updateQueuetness();
						} else {
							let list;
							if ( ctrlChckd( "shuffle" ) ) {
								if ( isShuffleBy( "folder" ) ) {

								// TODO on startup (assuming we end up here) pick up where we left off
									// currently finds a new folder to start instead of carrying on with the last one, even if there are tracks remaining to play

									if ( GLOBAL.current_playing_folder ) {
										let tof = tracksOfFolder( GLOBAL.current_playing_folder ),
												lstndx = tof.indexOf( GLOBAL.current_playing_track );
										if ( lstndx < minus1( tof.length ) ) {
											listing = tof[ plus1( lstndx ) ];
										} else {
											GLOBAL.current_playing_folder.classList.add( "played" );
										}
									}
									if ( !listing ) {

										// TODO fromPlaylist.tracks.firsts

										list = fromPlaylist.folders[ ctrlChckd( "skiplayed" ) ? "notPlayed" : "all" ]( ctrlChckd( "ignoreshufflefolder" ) );
										listing = tracksOfFolder( GLOBAL.current_playing_folder = list[ randNum( list.length ) ], 0 );
									} // TODO this shit is practically mirrored
								} else {
									list = fromPlaylist.tracks[ ctrlChckd( "skiplayed" ) ? "notPlayed" : "all" ]( ctrlChckd( "ignoreshuffletrack" ) );
									listing = list[ randNum( list.length ) ];
								}
							} else {

								// TODO allow next and back folder when not shuffle playing

								// TODO allow skipping played tracks when not shuffle playing?

								list = fromPlaylist.tracks.all( ctrlChckd( "ignorenonshuffle" ) );
								let lstndx = list.indexOf( GLOBAL.current_playing_track || notPop( GLOBAL.played ) );
								listing = list[ ~lstndx ? lstndx + ( prev ? -1 : 1 ) : 0 ];
							}
						}
					}
					let si;
					if ( listing && ctrlChckd( "respectsequences" ) && ( si = parseInt( getElementData( listing, "sequence" ) ) ) ) {

						// TODO when playing played?

						GLOBAL.track_sequence = tracksFromIds( ...GLOBAL.sequences[ minus1( si ) ] );
						clearQueueOf( GLOBAL.track_sequence );
						listing = GLOBAL.track_sequence.shift();
					}
					DOM_CONTROLS.classList.toggle( "show_cont_sequence", GLOBAL.track_sequence.length );
				}

				// TODO GLOBAL.preferences // folderStructOfTrack()

				if ( listing ) {
					DOM_AUDIO.src = `file:///${trackPath( listing )}`;
					displayTrackData( listing );
				} else if ( untilEndOf( "world" ) && numberOfNotBrokenTracks() ) { // TODO check this won't infinite loop
					DOM_AUDIO.removeAttribute( "src" );
					displayTrackData();
				}
			}
			resolve( true );
		} );
	},

	/* event functions */

	seekInput = evt => DOM_AUDIO.currentTime = evt.target.value,

	listEditorDragEnd = () => GLOBAL.dragee.classList.remove( "dragee" ),

	liFromEvtPath = evt => evt?.composedPath().find( e => tagIs( e, "li" ) ),

	dropzoneDragOver = evt => {
		debugMsg( "dropzoneDragOver:", evt );
		evt.preventDefault();
		evt.dataTransfer.dropEffect = "move";
	},

	listEditorDragStart = evt => {
		debugMsg( "listEditorDragStart:", evt );
		evt.dataTransfer.effectAllowed = "move";
		( GLOBAL.dragee = evt.target ).classList.add( "dragee" );
	},

	audioTimeUpdate = () => {
		let curt = DOM_AUDIO.currentTime,
				shake_the_hat = randNum( curt ); // TODO testing if this will unobtrusively improve the "randomness" of randNum()
		setElementData( DOM_CONTROLS.times, "rema", seconds2Str( ( DOM_AUDIO.duration - curt ) || 0 ) );
		setElementData( DOM_CONTROLS.times, "curt", seconds2Str( DOM_SEEK.control.value = curt ) );
	},

	audioLoadedMediaData = () => {
		let drtn = Math.ceil( DOM_AUDIO.duration ), // TODO does this need to be ceiled?
				tmstr = seconds2Str( drtn );
		DOM_SEEK.control.max = drtn;
		setElementData( DOM_CONTROLS.times, "dura", tmstr );
		setElementData( DOM_CONTROLS.times, "rema", tmstr );
	},

	audioError = evt => {
		debugMsg( "audioError:", { "evt": evt, "GLOBAL.current_playing_track": GLOBAL.current_playing_track }, "error" );
		GLOBAL.current_playing_track.classList.add( "broken" );
		updatePlaylistLength();
		TRANSPORT.nextTrack();

		// TODO if everything appears broken; slam the brakes on

		// TODO mark folders as broken if all their tracks are?

		// TODO offer to remove or do it automatically and give notice?
			// CONTROLS.fixBreakages()

		// TODO clean up GUI "breakages" button and counter after broken tracks are removed
			// updatePlaylistLength
	},

	controlsClick = evt => {
		debugMsg( "controlsClick:", evt );
		let trg = evt.target;
		if ( isBtn( trg ) ) {
			let fnc = trg.name;
			if ( CONTROLS.hasOwnProperty( fnc ) ) {
				if ( fnc === "listEditor" ) {

					// TODO sequence editor

					CONTROLS.listEditor( getElementData( trg, "list" ) );
				} else {
					CONTROLS[ fnc ]();
				}
			} else if ( TRANSPORT.hasOwnProperty( fnc ) ) {
				TRANSPORT[ fnc ]();
			}
		}
	},

	// TODO combine the shit out of this shit

	// TODO add other options for tracks in list editor appropriate for played and queue

	// TODO close context menu(s) when they're being ignored i.e. playlist menu should close if the editor is opened

	closeContextMenu = () => {
		DOM_PLAYLIST_CONTEXT_MENU.pffs.disabled = DOM_LIST_EDITOR_CONTEXT_MENU.pffs.disabled = true;
		DOM_PLAYLIST_CONTEXT_MENU.classList.remove( "show" );
		DOM_LIST_EDITOR_CONTEXT_MENU.classList.remove( "show" );
		scroll2Track(); // TODO annoying sometimes
	},

	listEditorContextMenuClick = evt => {
		debugMsg( "listEditorContextMenuClick:", evt );
		let trg = evt.target;
		if ( isBtn( trg ) ) {
			if ( trg.name === "reveal" ) {
				DOM_LIST_EDITOR_CONTEXT_MENU.li.classList.add( "focussed" );
				listEditorClick();
				scroll2Track( true );
			}
			closeContextMenu();
		}
	},

	listEditorContextMenu = evt => {
		debugMsg( "listEditorContextMenu:", evt );
		if ( !debugging ) {
			evt.preventDefault();
		}
		let trg = evt.target;
		if ( tagIs( trg, "li" ) ) {
			let tds = trg.dataset,
					li = tds.id ? trackFromId( tds.id ) : folderFromStruct( tds.folder );
			if ( li ) {
				let pos_y = Math.min( evt.y, Math.floor( innerHeight - DOM_LIST_EDITOR_CONTEXT_MENU.offsetHeight ) ),
						pos_x = Math.min( evt.x, Math.floor( innerWidth - DOM_LIST_EDITOR_CONTEXT_MENU.offsetWidth ) );
				DOM_LIST_EDITOR_CONTEXT_MENU.setAttribute( "style", `top:${pos_y}px;left:${pos_x}px` );
				DOM_LIST_EDITOR_CONTEXT_MENU.li = li;
				DOM_LIST_EDITOR_CONTEXT_MENU.pffs.disabled = false;
				DOM_LIST_EDITOR_CONTEXT_MENU.classList.add( "show" );
			}
		}
	},

	playlistContextMenuClick = evt => {
		debugMsg( "playlistContextMenuClick:", evt );
		let trg = evt.target;
		if ( isBtn( trg ) ) {
			let nme = trg.name;
			if ( nme === "google" ) {
				googleSearch( DOM_PLAYLIST_CONTEXT_MENU.google.title || DOM_PLAYLIST_CONTEXT_MENU.li );
			} else if ( nme !== "cancel" ) {
				playlistClick( { "clicky": nme, "trg": DOM_PLAYLIST_CONTEXT_MENU.li } );
			}
			closeContextMenu();
		}
	},

	playlistContextMenu = evt => {
		debugMsg( "playlistContextMenu:", evt );
		let pos_x, pos_y;
		if ( evt.nare ) {
			pos_y = evt.y;
			pos_x = evt.x;
		} else {
			if ( !debugging ) {
				evt.preventDefault();
			}
			pos_y = Math.min( evt.y, Math.floor( innerHeight - DOM_PLAYLIST_CONTEXT_MENU.offsetHeight ) );
			pos_x = Math.min( evt.x, Math.floor( innerWidth - DOM_PLAYLIST_CONTEXT_MENU.offsetWidth ) );
		}
		DOM_PLAYLIST_CONTEXT_MENU.setAttribute( "style", `top:${pos_y}px;left:${pos_x}px` );
		DOM_PLAYLIST_CONTEXT_MENU.google.title = googleSearch( DOM_PLAYLIST_CONTEXT_MENU.li = evt.li || liFromEvtPath( evt ), true );
		DOM_PLAYLIST_CONTEXT_MENU.pffs.disabled = false;
		DOM_PLAYLIST_CONTEXT_MENU.querySelector( `input[name="${ctrlVlu( "clicky" )}"]` ).focus();
		DOM_PLAYLIST_CONTEXT_MENU.classList.add( "show" );
	},

	// TODO combine the shit out of that shit

	listEditorClick = evt => {
		debugMsg( "listEditorClick:", evt );

		// TODO all DOM_PLAYLIST click actions in DOM_LIST_EDITOR too?

		let trg = evt?.target;
		if ( trg ) {
			let les = listEditorShowing(),
				nme = trg.name;
			if ( nme === "clear" ) {
				if ( les === "folders" ) {
					clearPlayedOf( fromPlaylist.tracks.ofPlayedFolders() );
				} else {
					clear( les );
				}
			} else if ( les === "queue" && nme === "shuffle" && GLOBAL.queue.length > 1 ) {
				shuffleArray( GLOBAL.queue );
				updateQueuetness( true );
				return;
			}
			if ( !trg.type ) {
				return;
			}
		}
		DOM_LIST_EDITOR.classList.remove( "show" );
		DOM_LIST_EDITOR.pffs.disabled = true;
		clearlistEditor();
	},

	dropzoneDrop = evt => {
		evt.preventDefault();
		debugMsg( "dropzoneDrop:", evt );

		// TODO visual indication of where dropped stuff will end up
			// dropzoneDragOver

		// TODO keyboard list editing
			// pgUp pgDn etc?

		// TODO why shouldn't I be able to edit the order of GLOBAL.played?
			// because it might be complicated ;)
			// playing played would go wild

		let lesq = listEditorShowing( "queue" ),
				drop_target = evt.target,
				dragged_folder = GLOBAL.dragee.firstElementChild,
				dragee_arr = ( dragged_folder ? arrayFrom( dragged_folder.children ) : arrayOf( GLOBAL.dragee ) ).map( tm => ( lesq ? GLOBAL.queue : GLOBAL.played ).find( li => pathsMatch( li, tm ) ) );
		if ( drop_target === DOM_LIST_EDITOR_TRASH ) {
			( lesq ? clearQueueOf : clearPlayedOf )( dragee_arr );
			refreshListEditor();
		} else if ( lesq ) { // TODO for now
			clearQueueOf( dragee_arr, true );
			if ( drop_target === DOM_LIST_EDITOR_LIST ) {
				GLOBAL.queue.push( ...dragee_arr );
			} else {
				GLOBAL.queue.splice( GLOBAL.queue.findIndex( li => pathsMatch( li, drop_target.firstElementChild?.lastElementChild || drop_target ) ), 0, ...dragee_arr );
			}
			updateQueuetness( true );
		}
	},

	audioEnded = () => {

		// TODO it needs to be possible to set to stop at the end of {thing} while the last track of {thing} is playing

		let cpt = GLOBAL.current_playing_track,
				cont = true;
		if ( cpt ) {
			GLOBAL.played.push( cpt );
			updatePlayedness();
			if ( playingPlayed() ) {
				++GLOBAL.played_index;
			}
		}
		DOM_AUDIO.removeAttribute( "src" );

		if ( GLOBAL.sequence_end && !GLOBAL.track_sequence.length && untilEndOf( "sequence" ) ) {
			cont = GLOBAL.sequence_end = false;
		}

		// TODO untilEndOf( "sequence" )
			// if a queue ends on a sequence and untilEndOf( "queue" ) is selected, the queue will be cleared, so convert to end after the sequence

		else if ( GLOBAL.queue_end && !GLOBAL.queue.length && untilEndOf( "queue" ) ) {
			cont = GLOBAL.queue_end = false;
		}

		else if ( untilEndOf( "track" ) || ( untilEndOf( "folder" ) && getElementData( cpt, "last_track" ) ) ) {
			cont = false;
		}
		if ( cont ) {
			TRANSPORT.playTrack();
		} else {
			setElementData( DOM_CONTROLS.times, "dura", seconds2Str() );
			selectNext().then( t => {
				setTitle( "[STOPPED]", true );
				setDefaultEndOf();
			} );
		}
	},

	playlistFilterClick = evt => {
		debugMsg( "playlistFilterClick:", evt );
		let trg = evt.target;
		if ( isBtn( trg ) ) {
			let nme = trg.name;
			if ( nme === "done" ) {
				closePlaylistFilter();
			} else if ( nme === "toqueue" ) {

				// TODO ctrlChckd( "skiplayed" )?
					// isPlayed()

				// TODO enqueue a track multiple times?

				let fltrd = fromPlaylist.tracks.filtered( ctrlChckd( "ignoreenqueuefilter" ) ); // NOTE: getting unqueued filtered tracks
				if ( fltrd.length ) {
					if ( confirm( "Shuffle tracks before adding to the queue?" ) ) { // TODO more options with less confirmation required O_o
						shuffleArray( fltrd );
					}
					GLOBAL.queue[ isCtrlVlu( "clicky", "end" ) ? "push" : "unshift" ]( ...fltrd );
					updateQueuetness();
				}
			}
		}
	},

	playlistFilterInput = evt => {
		debugMsg( "playlistFilterInput:", evt );
		let frsh = fltrChckd( "onlyunplayed" ) ? ":not(.played)" : "",
				cs = fltrChckd( "casensitive" ) ? "" : " i",
				vlu, tag, mth,
				fltrs = arrayFrom( DOM_PLAYLIST_FILTER.querySelectorAll( 'input[type="text"]' ) ).map( npt => {
					vlu = npt.value.trim();
					if ( vlu ) {
						tag = getElementData( npt.parentElement.querySelector( "legend" ), "data" );
						if ( npt.name === "contains" ) {
							vlu = vlu.split( " " ).map( str => `[data-${tag}*="${str}"${cs}]` ).join( "" );
							return `li${vlu}:not(.broken)${frsh}`;
						}
						return `li[data-${tag}${npt.name === "starts" ? "^" : "$"}="${vlu}"${cs}]:not(.broken)${frsh}`;
					}
				} ).filter( v => v ).join( fltrChckd( "combifilter" ) ? " " : "," ); // TODO combifilter won't work like this for more fields/tags;
		if ( fltrs.length ) {
			debugMsg( "playlistFilterInput - fltrs:", fltrs );

			// TODO this is bad M'Kay

			clearFilters();
			DOM_PLAYLIST.classList.add( "filtered" );
			DOM_PLAYLIST.querySelectorAll( fltrs ).forEach( li => {
				li.classList.add( "filtered" );
				if ( folderStruct( li ) ) {
					li.querySelectorAll( `li${frsh}` ).forEach( li => li.classList.add( "filtered" ) );
				} else {
					folderOfTrack( li ).classList.add( "filtered" );
				}
			} );
		} else {
			clearFilters();
		}
	},

	controlsInput = evt => {
		debugMsg( "controlsInput:", evt );
		let trg = evt.target,
				typ = trg.type;
		if ( typ ) {
			let vlu = trg.value,
					nme = trg.name;
			if ( typ === "range" ) {
				if ( nme === "volume" ) {
					DOM_AUDIO.volume = parseFloat( vlu );
				} else if ( nme === "displaybrightness" ) {
					displayBrightness( vlu );
				}
				setOp( nme, vlu );
			} else {
				if ( typ === "checkbox" ) {
					if ( nme === "scrolltoplaying" ) {
						DOM_BODY.classList.toggle( "scroll_to_playing", trg.checked );
						removeFocussed();
						scroll2Track();
					} else if ( nme === "smoothscrolling" ) {
						DOM_PLAYPEN.classList.toggle( "smooth_scrolling", trg.checked );
					} else if ( nme === "respectsequences" ) {
						DOM_CONTROLS.classList.toggle( "sequence_prev_next", trg.checked );
					}
				} else if ( typ === "radio" ) {
					if ( nme === "endof" && ( vlu === "world" || vlu === "list" ) ) {
						setElementData( DOM_CONTROLS, "defaultendof", vlu );
					}
				}
				toggleOptionsVisibility();
			}
			saveSettings();
		}
	},

	sourcesInput = evt => {
		debugMsg( "sourcesInput:", evt );
		let slv = String.raw`${DOM_SOURCES.libraries.value}`,
				libnme = DOM_SOURCES.lib_name.value,
				libpth = DOM_SOURCES.lib_path.value,
				trg = evt.target;
		if ( slv ) {
			DOM_SOURCES.lib_name.value = DOM_SOURCES.lib_path.value = "";
			DOM_SOURCES.include.disabled = false;
		} else {
			DOM_SOURCES.include.disabled = !( libnme && libpth );
		}
		if ( trg === DOM_SOURCES.include ) {
			if ( slv ) {

				// TODO validate pathiness

				libnme = DOM_SOURCES.libraries.querySelectorAll( "option" )[ DOM_SOURCES.libraries.selectedIndex ].textContent;
			} else {
				slv = String.raw`${DOM_SOURCES.lib_path.value}`;
			}
			CONTROLS.addTracks();
			let sp = slv.split( /\\|\//g ).filter( f => f ), cp,
					paths = arrayFrom( trg.files ).filter( file => /^audio\//.test( file.type ) ).map( file => {
						cp = sp.concat( file.webkitRelativePath.split( "/" ).filter( f => f ) );
						return {
							"a": cp.map( pp => encodeURIComponent( pp ) ).join( "/" ), // TODO reduce paths object size
							"f": cp.pop(),
							"d": cp.slice( plus1( sp.length ) ).join( " | " ),
							"i": ++GLOBAL.track_id
						};
					} );
			if ( paths.length ) {
				STORAGE.get( async store => {
					paths = await paths2Playlist( paths, store.paths );
					if ( paths.length ) {

						// TODO only if something new is actually being added

						// TODO provide some kind of progress indication?

						TRANSPORT.playTrack();
						let nl = { "lib_path": slv, "lib_name": libnme },
								libraries = ( store.libraries || [] ).filter( l => l.lib_path !== nl.lib_path ).concat( arrayOf( nl ) ); // TODO uniqueness must include selected folder
						setLibraries( libraries );
						STORAGE.set( { "libraries": libraries, "paths": paths } );

						// TODO storageStats()

					}
				} );
			}
		}
	},

	storageStats = () => STORAGE.getBytesInUse( bytes => {
		let quota = STORAGE.QUOTA_BYTES,
				rmnng = quota - bytes,
				qdboh = quota / 100;
		console.log( `Quota: ${quota}
Used: ${bytes} (${Math.round( bytes / qdboh )}%)
Remaining: ${rmnng} (${Math.round( rmnng / qdboh )}%)` );
	} ),

	playlistClick = evt => {
		debugMsg( "playlistClick:", evt );

		// TODO all DOM_PLAYLIST click actions in DOM_LIST_EDITOR too?

		let trg = folder( evt.trg || liFromEvtPath( evt ) || fromPlaylist.focussed() );
		if ( trg ) {
			let cv = evt.clicky || ctrlVlu( "clicky" ),
					tia = trg.tracks,
					tau = tia || arrayOf( trg ),
					tof = tia ? trg.folder : trg,
					fot = tia ? "folder" : "track";
			if ( cv === "delist" ) {

				// TODO playing tracks continue playing after being delisted O_o

				if ( confirm( `Remove this ${fot} from the playlist?` ) ) { // TODO don't require confirm if fake evt

					// TODO reduce paths object size

					// TODO when sequenced tracks are removed from the playlist, the respective sequence needs to be adjusted or deleted
						// broken tracks...

					clearQueueOf( tau );
					clearPlayedOf( tau );
					clearSequenceOf( tau );
					clearIgnorablesOf( tau );
					STORAGE.get( store => STORAGE.set( { "paths": store.paths.filter( sp => tia ? !tia.some( li => sp.a === trackPath( li ) ) : sp.a !== trackPath( trg ) ) } ) );
					tof.remove();

					// TODO if removing tracks leaves a folder empty, remove that too

					if ( ( tia && ~tia.indexOf( GLOBAL.current_playing_track ) ) || trg === GLOBAL.current_playing_track ) {
						TRANSPORT.nextTrack();
					}
					updatePlaylistLength();
				}
			} else if ( cv === "preference" ) {
				if ( !GLOBAL.preference ) {
					if ( confirm( `Confirm marking this ${fot} as preferred to another ${fot}, then mark the other ${fot} as what this is preferred to.` ) ) {
						GLOBAL.preference = idsFromTracks( tof )[ 0 ];
						tof.classList.add( "pref" );
					}
				} else {
					GLOBAL.preferences[ idsFromTracks( tof )[ 0 ] ] = GLOBAL.preference;
					STORAGE.set( { "preferences": GLOBAL.preferences } );
					tof.classList.add( "unpref" );
					GLOBAL.preference = null;
				}
			} else if ( cv === "sequence" ) {

				// TODO can a track be part of more than one sequence?

				tau = iDunnoWhat2CallThisEither( tia, "sequence", tau, clearSequenceOf );
				if ( iDunnoWhat2CallThis( tia, trg, isNewSequenced ) ) {
					GLOBAL.sequence.push( ...tau );
				}
				updateSequences();
			} else if ( cv === "unignorable" ) {
				clearIgnorablesOf( tau, true );
				if ( iDunnoWhat2CallThis( tia, trg, trackIgnorable ) ) {
					GLOBAL.ignorable.push( ...tau );
				}
				updateIgnorables();
			} else if ( cv === "unplayed" ) {
				clearPlayedOf( tau, true );
				if ( iDunnoWhat2CallThis( tia, trg, isPlayed ) ) {
					GLOBAL.played.push( ...tau );
				}
				updatePlayedness();
			} else {

				// TODO enqueue a track multiple times?

				// TODO click on/off like the others?

				// TODO if ( tia && ctrlChckd( "shuffle" ) ) offer to shuffle before adding folders to the queue?

				tau = iDunnoWhat2CallThisEither( tia, "enqueue", tau, clearQueueOf );
				if ( cv === "now" ) {
					if ( !tia && trg === GLOBAL.current_playing_track ) {
						TRANSPORT.backTrack();
						return;
					}
					GLOBAL.queue.unshift( ...tau );
					TRANSPORT.nextTrack();
				} else if ( cv === "next" ) {
					GLOBAL.queue.unshift( ...tau );
				} else if ( cv === "end" ) {
					GLOBAL.queue.push( ...tau );
				}
				updateQueuetness();
			}
		}
	},

	// TODO it is entirely possible that I have completely lost what little of the plot I had left

	iDunnoWhat2CallThis = ( tia, trg, fnc ) => ( !tia && !fnc( trg ) ) || ( tia && tia.filter( li => fnc( li ) ).length < half( tia.length ) ),

	iDunnoWhat2CallThisEither = ( tia, gnrbl, tau, fnc ) => {
		if ( tia && ctrlChckd( `ignore${gnrbl}folder` ) ) {
			tau = tau.filter( li => !trackIgnorable( li ) );
		}
		fnc( tau, true );
		return tau;
	},

	keyDown = evt => {

		// TODO keyboard access sucks less now but still...

		let k = evt.key,
				ctrl = evt.ctrlKey,
				shft = evt.shiftKey,
				pgud = k.match( /^Page(Up|Down)$/ ),
				no = !listEditorShowing() && !playlistFilterShowing(), // TODO this needs work
				fcs;
		debugMsg( "keyDown:", { "evt": evt, "key": k, "ctrl": ctrl, "shft": shft } );
		if ( !!pgud && no ) {
			let hpp = halfPlaypen(),
					all = fromPlaylist[ shft ? "folders" : "tracks" ].all();
			fcs = removeFocussed() || cloneArray( all ).sort( ( a, b ) => ( a.offsetTop - hpp ) + ( b.offsetTop - hpp ) )[ 0 ]; // TODO find the nearest element more efficiently?
			if ( fcs ) {
				let up = pgud[ 1 ] === "Up";
				if ( !shft && folderStruct( fcs ) ) {
					if ( up ) {
						fcs = notPop( tracksOfFolder( fcs.previousElementSibling ) );
					} else {
						fcs = tracksOfFolder( fcs, 0 );
					}
				} else if ( shft && !folderStruct( fcs ) ) {
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
				scroll2Track();
			}
		} else {
			if ( ctrl ) {
				switch ( k ) {
					case "f": {
						evt.preventDefault();
						CONTROLS.playlistFilter();
						break;
					}
					case ".": {
						if ( playingPlayed() ) {
							CONTROLS.stopPlayingPlayed();
						}
						break;
					}
				}
				if ( isShuffleBy( "folder" ) ) {
					switch ( k ) {
						case "[": TRANSPORT.prevFolder(); break;
						case ";": TRANSPORT.backFolder(); break;
						case "]": TRANSPORT.nextFolder(); break;
					}
				}
			} else if ( document.activeElement.type !== "text" ) {
				switch ( k ) {
					case "Backspace": {

						// TODO closeContextMenu()?
							// probably; maybe try testing it?
								// that seems like a lot of effort -_-

						removeFocussed();
						scroll2Track();
						break;
					}
					case "m": {
						if ( contextMenuShowing() ) {
							closeContextMenu();
						} else if ( no && ( fcs = fromPlaylist.focussed() || GLOBAL.current_playing_track ) ) {
							playlistContextMenu( {
								y: half( innerHeight - DOM_PLAYLIST_CONTEXT_MENU.offsetHeight ),
								x: half( innerWidth - DOM_PLAYLIST_CONTEXT_MENU.offsetWidth ),
								nare: true,
								li: fcs
							} );
						}
						break;
					}
					case "g": googleSearch(); break;
					case "s": CONTROLS.sequencify(); break;
					case "[": TRANSPORT.prevTrack(); break;
					case ";": TRANSPORT.backTrack(); break;
					case ",": TRANSPORT.pawsTrack(); break;
					case ".": TRANSPORT.stopTrack(); break;
					case "]": TRANSPORT.nextTrack(); break;
					case "q": CONTROLS.listEditor( "queue" ); break;
					case "p": CONTROLS.listEditor( "played" ); break;
					case "f": CONTROLS.listEditor( "folders" ); break;
				}
			}
		}
	},

	mindTheStore = store => {
		return new Promise( resolve => {
			if ( store ) {
				let s = store.sequences,
						i = store.ignorable,
						p = store.played,
						q = store.queue;
				if ( s?.length ) {
					GLOBAL.sequences = s; // TODO tracksFromIds?
					updateSequences();
				}
				if ( i?.length ) {
					GLOBAL.ignorable.push( ...tracksFromIds( ...i ) );
					updateIgnorables();
				}
				if ( p?.length ) {
					GLOBAL.played.push( ...tracksFromIds( ...p ) );
					updatePlayedness();
				}
				if ( q?.length ) {
					GLOBAL.queue.push( ...tracksFromIds( ...q ) );
					updateQueuetness();
				}
				GLOBAL.preferences = store.preferences;
				updatePreferences();
			}
			resolve( true );
		} );
	},

	saveSettings = () => STORAGE.set( { "settings": {
		ignoresequencefolder: ctrlChckd( "ignoresequencefolder" ),
		ignoreshufflefolder: ctrlChckd( "ignoreshufflefolder" ),
		ignoreenqueuefilter: ctrlChckd( "ignoreenqueuefilter" ),
		ignoreenqueuefolder: ctrlChckd( "ignoreenqueuefolder" ),
		ignoreplayedfolder: ctrlChckd( "ignoreplayedfolder" ),
		ignoreshuffletrack: ctrlChckd( "ignoreshuffletrack" ),
		respectpreferences: ctrlChckd( "respectpreferences" ),
		respectsequences: ctrlChckd( "respectsequences" ),
		ignorenonshuffle: ctrlChckd( "ignorenonshuffle" ),
		sequenceprevnext: ctrlChckd( "sequenceprevnext" ),
		scrolltoplaying: ctrlChckd( "scrolltoplaying" ),
		smoothscrolling: ctrlChckd( "smoothscrolling" ),
		skiplayed: ctrlChckd( "skiplayed" ),
		wakeful: ctrlChckd( "wakeful" ),
		shuffle: ctrlChckd( "shuffle" ),
		displaybrightness: ctrlVlu( "displaybrightness" ),
		displaycontrols: ctrlVlu( "switchControls" ),
		shuffleby: ctrlVlu( "shuffleby" ),
		softstop: ctrlVlu( "softstop" ),
		clicky: ctrlVlu( "clicky" ),
		volume: ctrlVlu( "volume" ),
		endof: ctrlVlu( "endof" ),
		defaultendof: getElementData( DOM_CONTROLS, "defaultendof" )
	} } ),

	applySettings = settings => {
		return new Promise( resolve => {
			let sttngs = Object.assign( {
					ignoresequencefolder: false,
					ignoreshufflefolder: false,
					ignoreenqueuefilter: false,
					ignoreenqueuefolder: false,
					ignoreplayedfolder: false,
					ignoreshuffletrack: false,
					respectpreferences: true,
					ignorenonshuffle: false,
					sequenceprevnext: true,
					respectsequences: true,
					scrolltoplaying: true,
					smoothscrolling: true,
					skiplayed: true,
					wakeful: true,
					shuffle: true,
					defaultendof: "world",
					shuffleby: "track",
					endof: "world",
					clicky: "end",
					displaycontrols: "LEFT", // NOTE: flipped by logic; RIGHT is the real default
					displaybrightness: "1",
					softstop: "0",
					volume: "0.5"
				}, settings || {} );

			// TODO reduce repeated code

			displayBrightness( setOp( "displaybrightness", DOM_CONTROLS.displaybrightness.value = sttngs.displaybrightness ) );

			DOM_BODY.classList.toggle( "display_controls_left", ( DOM_CONTROLS.switchControls.value = sttngs.displaycontrols ) === "RIGHT" );

			setOp( "volume", DOM_AUDIO.volume = parseFloat( DOM_CONTROLS.volume.value = sttngs.volume ) );
			setOp( "softstop", DOM_CONTROLS.softstop.value = sttngs.softstop );

			setElementData( DOM_CONTROLS, "defaultendof", sttngs.defaultendof );

			DOM_CONTROLS.classList.toggle( "sequence_prev_next", DOM_CONTROLS.respectsequences.checked = sttngs.respectsequences );

			DOM_CONTROLS.smoothscrolling.checked = DOM_PLAYPEN.classList.toggle( "smooth_scrolling", sttngs.smoothscrolling );
			DOM_CONTROLS.scrolltoplaying.checked = DOM_BODY.classList.toggle( "scroll_to_playing", sttngs.scrolltoplaying );

			DOM_CONTROLS.ignoresequencefolder.checked = sttngs.ignoresequencefolder;
			DOM_CONTROLS.ignoreshufflefolder.checked = sttngs.ignoreshufflefolder;
			DOM_CONTROLS.ignoreenqueuefilter.checked = sttngs.ignoreenqueuefilter;
			DOM_CONTROLS.ignoreenqueuefolder.checked = sttngs.ignoreenqueuefolder;
			DOM_CONTROLS.ignoreplayedfolder.checked = sttngs.ignoreplayedfolder;
			DOM_CONTROLS.ignoreshuffletrack.checked = sttngs.ignoreshuffletrack;
			DOM_CONTROLS.respectpreferences.checked = sttngs.respectpreferences;
			DOM_CONTROLS.sequenceprevnext.checked = sttngs.sequenceprevnext;
			DOM_CONTROLS.ignorenonshuffle.checked = sttngs.ignorenonshuffle;
			DOM_CONTROLS.skiplayed.checked = sttngs.skiplayed;
			DOM_CONTROLS.wakeful.checked = sttngs.wakeful;
			DOM_CONTROLS.shuffle.checked = sttngs.shuffle;

			DOM_CONTROLS.shuffleby.value = sttngs.shuffleby;
			DOM_CONTROLS.clicky.value = sttngs.clicky;
			DOM_CONTROLS.endof.value = sttngs.endof;

			toggleOptionsVisibility();
			resolve( true );
		} );
	};

addEventListener( "keydown", keyDown );

DOM_AUDIO.addEventListener( "error", audioError, { passive: true } );
DOM_AUDIO.addEventListener( "ended", audioEnded, { passive: true } );
DOM_AUDIO.addEventListener( "timeupdate", audioTimeUpdate, { passive: true } );
DOM_AUDIO.addEventListener( "loadedmetadata", audioLoadedMediaData, { passive: true } );

DOM_SOURCES.addEventListener( "input", sourcesInput, { passive: true } );

DOM_CONTROLS.addEventListener( "click", controlsClick );
DOM_CONTROLS.addEventListener( "input", controlsInput, { passive: true } );

DOM_SEEK.addEventListener( "input", seekInput, { passive: true } );

DOM_PLAYLIST_FILTER.addEventListener( "input", playlistFilterInput, { passive: true } );
DOM_PLAYLIST_FILTER.addEventListener( "click", playlistFilterClick, { passive: true } );

DOM_PLAYLIST.addEventListener( "contextmenu", playlistContextMenu );
DOM_PLAYLIST.addEventListener( "click", playlistClick, { passive: true } );

DOM_PLAYLIST_CONTEXT_MENU.addEventListener( "click", playlistContextMenuClick, { passive: true } );
DOM_LIST_EDITOR_CONTEXT_MENU.addEventListener( "click", listEditorContextMenuClick, { passive: true } );

DOM_LIST_EDITOR.addEventListener( "contextmenu", listEditorContextMenu );
DOM_LIST_EDITOR.addEventListener( "click", listEditorClick, { passive: true } );
DOM_LIST_EDITOR.addEventListener( "dragend", listEditorDragEnd, { passive: true } );
DOM_LIST_EDITOR.addEventListener( "dragstart", listEditorDragStart, { passive: true } );
DOM_LIST_EDITOR.querySelectorAll( ".dropzone" ).forEach( dz => {
	dz.addEventListener( "dragover", dropzoneDragOver );
	dz.addEventListener( "drop", dropzoneDrop );
} );

STORAGE.get( store => {
	applySettings( store.settings ).then( t => {
		paths2Playlist( store.paths ).then( t => {
			mindTheStore( store ).then( t => {
				TRANSPORT.playTrack();
				setLibraries( store.libraries );
			} );
		} );
	} );
} );
