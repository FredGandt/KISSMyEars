
/* TODO

if shuffleBy( "folder" ) && queue created; option to finish the folder first, play the queue then come back to the folder, or simply move on

sequencify folders for isShuffleBy( "folder" ) i.e. dic 1 & 2 of double album

temporary ignorables during not shuffled play e.g. skip tracks this time
	break at marker?

if recycling; recycle folder with unplayed ignorables...?

tag prefered versions i.e. play the prefered track/folder instead

mark folders to be ignored during shuffle by folder

skip sequence button (instead of next next next...)

mark newly added tracks and make them easy to find

sequence editing
	add tracks to or remove tracks from established sequences
	alter the order of tracks in a sequence
	combine or split sequences
	delete sequences

playing played sequenced tracks...

prioritise UX for visually impaired

fix responsiveness of UI
	// window.devicePixelRatio
	// window.matchMedia()
	// css max() & min()

gapless playback (surprisingly shitty)

merge new imports into related folders
	CONTROLS.fixBreakages()

save queue as playlist
	giveFile()

tags
	https://taglib.org/api/
	https://pypi.org/project/pytaglib/
	https://en.wikipedia.org/wiki/TagLib
	https://developer.mozilla.org/en-US/docs/WebAssembly
	https://emscripten.org/docs/getting_started/Tutorial.html
		organise playback by tag
		sorting and searching
		merging uploads
		tag embedded images
		replaygain
			https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
			https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
		scrobbling
			https://www.last.fm/api/scrobbling

possible settings/options
	include cover art image files in uploads and display
	start shuffle play again after e.g. finishing a folder etc.
	disable marking queued tracks as played during otherwise shuffled play
	repeat track, folder, sequence, queue (or playlist when implemented)

maybe
	use virtual DOM for DOM_PLAYLIST
	indexedDB instead of localStorage
	skip silent sections in tracks e.g. leading to hidden tracks.
		https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
		https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode

*/

"use strict";

function FromPlaylist() {
	this.get = ( qs, gnrbl ) => {
		let arr = arrayFrom( DOM_PLAYLIST.querySelectorAll( qs ) );
		if ( gnrbl ) {
			return arr.filter( li => !isIgnorable( li ) );
		}
		return arr;
	};

	this.tracks = {
		ignorable: () => this.get( 'ol li:not(.broken) span[data-ignorable]:not([data-ignorable=""])' ),
		sequenced: () => this.get( 'ol li:not(.broken) span[data-sequence]:not([data-sequence=""])' ),
		queue: () => this.get( 'ol li:not(.broken) span[data-queue]:not([data-queue=""])' ), // TODO should be "queued" but for scrubTrackMarkers() -_-
		sequence: () => this.get( 'ol li:not(.broken) span[data-sequence^="NEW"]' ), // TODO should be "sequencifiable" but for scrubTrackMarkers() -_-

		notPlayed: gnrbl => this.get( "ol li:not(.broken):not(.played)", gnrbl ),
		filtered: () => this.get( "ol li:not(.broken).filtered" ),
		played: () => this.get( "ol li:not(.broken).played" ),
		all: gnrbl => this.get( "ol li:not(.broken)", gnrbl ),
		broken: () => this.get( "ol li.broken" )
	};

	this.folders = {
		notPlayed: gnrbl => this.get( "li[data-folder_struct]:not(.played)", gnrbl ),
		played: () => this.get( "li[data-folder_struct].played" ),
		all: gnrbl => this.get( "li[data-folder_struct]", gnrbl )
	};

	this.focussed = () => this.get( "li:not(.broken).focussed" )[ 0 ];
	this.filtered = () => this.get( "li:not(.broken).filtered" );
	this.played = () => this.get( "li:not(.broken).played" );
};

let global__current_playing_folder,
	global__current_playing_track,
	global__track_sequence = [],
	global__played_index = null,
	global__playlist_fragment,
	global__queue_end = false,
	global__softstop = false,
	global__ignorable = [],
	global__sequences = [],
	global__sequence = [],
	global__track_id = 0,
	global__played = [],
	global__queue = [],
	global__dragee,

	debugging = false;

const DOM_LIST_EDITOR_CONTEXT_MENU = document.getElementById( "list_editor_context_menu" ),
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

	BROWSER = ( "browser" in window ? browser : chrome ),
	STORAGE = BROWSER.storage.local,

	TEMPLATES = {
		playlist_filter: document.getElementById( "playlist_filter_template" ).content.firstElementChild,
		folder: document.getElementById( "folder_template" ).content.firstElementChild,
		track: document.getElementById( "track_template" ).content.firstElementChild
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

	trackID = li => li.dataset.id, // TODO reduce paths object size

	notPop = arr => arr.slice( -1 )[ 0 ],

	arrayFrom = lst => Array.from( lst ),

	cloneArray = arr => [].concat( arr ),

	ctrlVlu = ctrl => DOM_CONTROLS[ ctrl ].value,

	underspace = str => str.replace( /_+/g, " " ),

	trackAbsPath = li => li.dataset.track_abs_path,

	randNum = n => Math.floor( Math.random() * n ),

	untilEndOf = cont => isCtrlVlu( "endof", cont ),

	ctrlChckd = ctrl => DOM_CONTROLS[ ctrl ].checked,

	isShuffleBy = sb => isCtrlVlu( "shuffleby", sb ),

	trackIDs = lst => lst.map( li => trackID( li ) ),

	resetTrackTime = () => DOM_AUDIO.currentTime = 0,

	folderOfTrack = li => li.parentElement.parentElement,

	isCtrlVlu = ( ctrl, vlu ) => ctrlVlu( ctrl ) === vlu,

	isIgnorable = li => trackTitleDataset( li ).ignorable, // TODO take array

	displayBrightness = bn => DOM_BODY.style.opacity = bn,

	isBtn = trg => trg && trg.type && trg.type === "button",

	fltrChckd = ctrl => DOM_PLAYLIST_FILTER[ ctrl ].checked,

	numberOfNotBrokenTracks = () => fromPlaylist.tracks.all().length,

	arrayize = stuff => ( Array.isArray( stuff ) ? stuff : [ stuff ] ),

	folderStruct = li => ( li ? li.dataset.folder_struct : undefined ),

	absPathsMatch = ( a, b ) => trackAbsPath( a ) === trackAbsPath( b ),

	trackTitleDataset = li => li.querySelector( "span[data-title]" ).dataset,

	listEditingQueue = trg => ( trg || DOM_LIST_EDITOR ).dataset.list === "queue", // TODO this is a bit rubbish

	halfPlaypen = () => DOM_PLAYPEN.scrollTop + ( DOM_PLAYPEN.offsetHeight * 0.5 ),

	playingPlayed = () => DOM_SPP.classList.toggle( "show", global__played_index ),

	playlistFilterShowing = () => DOM_PLAYLIST_FILTER.classList.contains( "show" ),

	cleanTitle = () => document.title.replace( /^(?:\[(?:PAUS|STOPP)ED\] )+/, "" ),

	contextMenuShowing = () => DOM_PLAYLIST_CONTEXT_MENU.classList.contains( "show" ),

	multiTrack = ( n, tof ) => `${n} ${( tof ? tof : "TRACK" )}${( n !== 1 ? "S" : "" )}`,

	markUnplayed = lis => arrayize( lis ).forEach( li => li.classList.remove( "played" ) ),

	folder = li => ( folderStruct( li ) ? { "folder": li, "tracks": tracksOfFolder( li ) } : li ),

	scrubTrackMarkers = mrkr => fromPlaylist.tracks[ mrkr ]().forEach( xi => xi.dataset[ mrkr ] = "" ),

	tracksFromIDs = ids => arrayize( ids ).map( id => DOM_PLAYLIST.querySelector( `li[data-id="${id}"]` ) ),

	// TODO maintain "[STOPPED/PAUSED]" prefix if nexting from stopped
	setTitle = ( ttl, pp ) => document.title = ( ttl ? ttl + ( pp ? ` ${cleanTitle()}` : "" ) : cleanTitle() ),

	setLibraries = libs => DOM_SOURCES.libraries.innerHTML = `<option value="" selected>ADD NEW LIBRARY</option>` +
		( libs || [] ).map( l => `<option value="${l.lib_path}" title="${l.lib_path}">${l.lib_name}</option>` ).join( "" ),

	tagIs = ( tag, nme, typ ) => tag.tagName && tag.tagName.toLowerCase() === nme && ( typ ? tag.type && tag.type === typ : true ),

	sortPlaylist = () => DOM_PLAYLIST.append( ...fromPlaylist.folders.all().sort( ( a, b ) => collator.compare( folderStruct( a ), folderStruct( b ) ) ) ),

	TRANSPORT = {
		backTrack: () => {
			resetTrackTime();
			if ( DOM_AUDIO.paused && ctrlChckd( "wakeful" ) ) {
				DOM_AUDIO.play();
				setTitle();
			}
		},

		nextTrack: prev => {
			let paused = DOM_AUDIO.paused;
			TRANSPORT.stopTrack( true );
			if ( !prev && playingPlayed() ) {
				++global__played_index;
			}
			if ( paused && !ctrlChckd( "wakeful" ) ) {
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
			// an overide is needed when suffle is off, so rather than previously played, it selects the previous track in the DOM_PLAYLIST
			// going to a previous track during a queue should requeue the track you've just ignored i.e. maintain the queue

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
				let fade = DOM_CONTROLS.softstop.valueAsNumber;
				if ( !rs && fade && !global__softstop && DOM_AUDIO.volume ) {
					await softStop( fade );
				}
				DOM_AUDIO.pause();
				DOM_AUDIO.volume = DOM_CONTROLS.volume.valueAsNumber;
				resetTrackTime();
				if ( rs ) {
					DOM_AUDIO.removeAttribute( "src" );
				} else {
					setTitle( "[STOPPED]", true );
				}
			}
		},

		prevFolder: () => {
			global__current_playing_folder = folderOfTrack( cloneArray( global__played ).reverse().find( trck => folderOfTrack( trck ) !== global__current_playing_folder ) );
			TRANSPORT.nextTrack();
		},

		backFolder: () => {
			global__current_playing_track = null;
			TRANSPORT.nextTrack();
		},

		// TODO allow next and back folder when not shuffle playing?

		nextFolder: () => {
			global__current_playing_folder = null;
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
			sc.value = ( DOM_BODY.classList.toggle( "display_controls_left", sc.value === "LEFT" ) ? "RIGHT" : "LEFT" );
		},

		sequencify: () => {

			// TODO ctrlChckd( "ignoresequencefolder" )

			if ( global__sequence.length ) {
				global__sequences.push( trackIDs( global__sequence ) );
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

		listEditor: list => {

			// TODO switch from "global__queue" to "global__played" and back

			// TODO sequence editing

			if ( listEditorShowing() ) {
				listEditorClick();
			} else if ( list.length ) {
				appendClones2ListEditor( list );
				if ( playlistFilterShowing() ) {
					closePlaylistFilter();
				}
				DOM_LIST_EDITOR.dataset.list = ( list === global__queue ? "queue" : "played" );
				DOM_LIST_EDITOR.classList.add( "show" );
				DOM_LIST_EDITOR.pffs.disabled = false;
				DOM_LIST_EDITOR.done.focus();
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

					clear( "global__track_sequence" );
					clear( "global__sequences" );
					clear( "global__sequence" );
					updateSequences();

					clear( "global__ignorable" );
					updateIgnorables();

					clear( "global__played" );
					updatePlayedness();

					clear( "global__queue" );
					updateQueuetness();

					STORAGE.remove( [ "paths", "queue", "played", "sequences", "ignorable" ] );
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

	refreshListEditor = () => {
		DOM_LIST_EDITOR_LIST.innerHTML = "";
		appendClones2ListEditor( ( listEditingQueue() ? global__queue : global__played ) );
	},

	setDefaultEndOf = () => {
		DOM_CONTROLS.endof.value = DOM_CONTROLS.dataset.defaultendof;

		// TODO move the focus too?

		saveSettings();
	},

	// TODO combine the shit out of this shit

	clearQueueOf = ( arr, shave ) => {
		global__queue = global__queue.filter( li => !~arr.indexOf( li ) );
		if ( !shave ) {
			updateQueuetness();
		}
	},

	clearPlayedOf = ( arr, shave ) => {
		global__played = global__played.filter( li => !~arr.indexOf( li ) );
		if ( !shave ) {
			updatePlayedness();
		}
	},

	clearSequenceOf = ( arr, shave ) => {
		global__sequence = global__sequence.filter( li => !~arr.indexOf( li ) );
		if ( !shave ) {
			updateSequences();
		}
	},

	clearIgnorablesOf = ( arr, shave ) => {
		global__ignorable = global__ignorable.filter( li => !~arr.indexOf( li ) );
		if ( !shave ) {
			updateIgnorables();
		}
	},

	// TODO combine the shit out of those shits

	shuffleArray = arr => {
		arr.forEach( ( r, i ) => {
			r = randNum( plus1( i ) );
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

	removeFocussed = () => {
		let fcs = fromPlaylist.focussed();
		if ( fcs ) {
			fcs.classList.remove( "focussed" );
			return fcs;
		}
		return null;
	},

	clearFilters = done => {
		if ( done ) {
			DOM_PLAYLIST.classList.remove( "filtered" );
		}
		fromPlaylist.filtered().forEach( li => li.classList.remove( "filtered" ) );
	},

	setOp = ( ctrl, op ) => {
		let dom_ctrl = DOM_CONTROLS[ ctrl ];
		if ( ctrl === "playedafter" ) {
			let pav = op || dom_ctrl.value;
			op = ( pav === dom_ctrl.max ? "AT END" : ( parseInt( pav ) ? pav : "NEVER" ) );
		}
		return ( dom_ctrl.parentElement.dataset.op = op );
	},

	scroll2Track = frc => {

		// TODO goes wonky sometimes after being brought to the foreground

		// TODO isShuffleBy( "folder" )??

		if ( frc || ( !global__sequence.length && !playlistFilterShowing() && !contextMenuShowing() ) ) {
			let fcs = fromPlaylist.focussed();
			if ( fcs || ( global__current_playing_track && ctrlChckd( "scrolltoplaying" ) ) ) {
				requestIdleCallback( () => DOM_PLAYPEN.scrollBy( 0, ( fcs || global__current_playing_track ).offsetTop - DOM_PLAYPEN.offsetTop - halfPlaypen() ) );
			}
		}
	},

	listEditorShowing = lst => {
		if ( DOM_LIST_EDITOR.classList.contains( "show" ) ) {
			if ( lst ) {
				if ( DOM_LIST_EDITOR.dataset.list === lst ) {
					return true;
				}
				return false;
			}
			return true;
		}
		return false;
	},

	softStop = fs => {

		// TODO subtle as having your brains smashed out with a slice of lemon wrapped round a large gold brick

		// TODO cancel (cut to chase) if backTrack is used

		return new Promise( resolve => {
			let sov = DOM_AUDIO.volume / ( fs * 100 );
			global__softstop = setInterval( () => {
				if ( ( DOM_AUDIO.volume -= sov ) <= sov ) {
					clearInterval( global__softstop );
					global__softstop = false;
					DOM_AUDIO.volume = 0;
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
			let trcks = arrayFrom( fldr.querySelectorAll( "li" ) );
			if ( trcks.length ) {
				if ( typeof trck === "number" ) {
					return trcks[ trck ];
				}
				return trcks;
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
				query = ( li.folder ? folderStruct( li.folder ) : `${folderStruct( folderOfTrack( li ) )} | ${li.dataset.title}` );
			}
			if ( rtq ) {
				return query;
			}

			// TODO with tags; track search should be `"${artist}" "${title}"`

			if ( query ) {
				BROWSER.tabs.create( { "url": `https://www.google.com/search?q=${encodeURIComponent( query )}`, "active": true } );
			}
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
			case "global__sequence": {
				global__sequence = [];
				updateSequences();
				break;
			}
			case "global__sequences": {
				global__sequences = [];
				updateSequences();
				break;
			}
			case "global__ignorable": {
				global__ignorable = [];
				updateIgnorables();
				break;
			}
			case "global__track_sequence": {
				global__track_sequence = [];
				break;
			}
		}
	},

	updatePlaylistLength = () => {
		let atl = numberOfNotBrokenTracks(),
			btl = fromPlaylist.tracks.broken().length,
			pllds = DOM_CONTROLS.playlist_length.dataset;
		pllds.tracks = multiTrack( atl );
		pllds.broken = ( btl ? ` + ${btl} BROKEN` : "" );
		DOM_CONTROLS.fixBreakages.classList.toggle( "show", btl ); // TODO CONTROLS.fixBreakages()
		pllds.folders = multiTrack( fromPlaylist.folders.all().length, "FOLDER" );
	},

	updateIgnorables = () => {
		let il = global__ignorable.length;
		STORAGE.set( { "ignorable": trackIDs( global__ignorable ) } );
		scrubTrackMarkers( "ignorable" );
		global__ignorable.forEach( i => trackTitleDataset( i ).ignorable = "?" );
	},

	updateQueuetness = () => {
		let ql = global__queue.length;
		STORAGE.set( { "queue": trackIDs( global__queue ) } );
		scrubTrackMarkers( "queue" );
		if ( DOM_CONTROLS.classList.toggle( "show_cont_queue", ql ) ) {
			DOM_CONTROLS.queue_length.dataset.ql = multiTrack( ql );
			global__queue.forEach( ( q, i ) => trackTitleDataset( q ).queue = `${plus1( i )}/${ql}` );
		}
	},

	updateSequences = () => {
		let sl = global__sequence.length;
		STORAGE.set( { "sequences": global__sequences } );
		scrubTrackMarkers( "sequence" );
		if ( sl ) {
			global__sequence.forEach( ( li, i ) => sequenced( li, `NEW:${plus1( i )}` ) );
			if ( DOM_CONTROLS.sequence_fs.classList.toggle( "show", sl > 1 ) ) {
				DOM_CONTROLS.sequence_length.dataset.sl = multiTrack( sl );
			}
		} else {
			DOM_CONTROLS.sequence_fs.classList.remove( "show" );
			global__sequences.forEach( ( squnc, ndx ) => tracksFromIDs( squnc ).forEach( ( li, i ) => sequenced( li, `${plus1( ndx )}:${plus1( i )}` ) ) );

			// TODO removal of dead sequences; "dead"? please leave clearer notes  >.<

			// TODO sequence editor
		}
	},

	updatePlayedness = cpt => {
		let fldr, trcks, pl;

		// TODO stop at the end of played?

		// TODO duplications?
			// global__played could have a length of 10 but contain only 1 track

		if ( cpt && DOM_CONTROLS.playedafter.valueAsNumber && cpt !== notPop( global__played ) ) { // TODO this condition is a bit cheeky really
			global__played.push( cpt );
		}

		// TODO doing the hokey-cokey with classes -_-

		markUnplayed( fromPlaylist.played() );

		global__played.forEach( li => {
			li.classList.add( "played" );
			fldr = folderOfTrack( li );
			if ( !fldr.querySelector( "li:not(.played)" ) ) {
				fldr.classList.add( "played" );
			}
		} );

		if ( cpt && ctrlChckd( "recycle" ) ) {
			fromPlaylist.folders.played().forEach( li => {
				trcks = tracksOfFolder( li );
				clearPlayedOf( trcks, true );
				markUnplayed( trcks );
				markUnplayed( li );
			} );
		}

		STORAGE.set( { "played": trackIDs( global__played ) } );
		if ( listEditorShowing( "played" ) ) {
			refreshListEditor();
		}
		pl = global__played.length;
		if ( DOM_CONTROLS.classList.toggle( "show_cont_played", pl ) ) {
			DOM_CONTROLS.played_length.dataset.pl = multiTrack( pl );
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
				( hours ? `${hours}`.padStart( 2, "0" ) : "" ),
				`${minutes}`.padStart( 2, "0" ),
				`${Math.floor( seconds )}`.padStart( 2, "0" )
			].filter( a => a ).join( ":" );
		}
		return "00:00";
	},

	appendClones2ListEditor = list => {
		list.forEach( li => {
			let clone = li.cloneNode(),
				lc = DOM_LIST_EDITOR_LIST.lastElementChild,
				fldr = clone.dataset.folder = folderStruct( folderOfTrack( li ) ) || "";
				clone.draggable = true;
			if ( lc?.dataset.folder === fldr ) {
				let ol = lc.firstElementChild;
				if ( ol ) {
					ol.append( clone );
				} else {
					li = TEMPLATES.folder.cloneNode( true );
					li.draggable = true;
					li.dataset.folder = fldr;
					li.firstElementChild.append( lc, clone );
					DOM_LIST_EDITOR_LIST.append( li );
				}
			} else {
				DOM_LIST_EDITOR_LIST.append( clone );
			}
		} );
	},

	displayTrackData = listing => {
		if ( global__current_playing_track ) {
			global__current_playing_track.classList.remove( "playing" );
		}
		if ( listing ) {
			global__current_playing_folder = folderOfTrack( global__current_playing_track = listing );
			listing.classList.add( "playing" );
			setTitle( listing.dataset.title );
			scroll2Track();
		} else {
			global__current_playing_folder = global__current_playing_track = null;
			if ( global__played.length && confirm( "Clear the play history?" ) ) {
				clear( "global__played" );
			}
			setTitle( "KISS My Ears" );
		}
	},

	collection2HTML = ( folder, end ) => {

		// TODO use tags to determine fields to create

		if ( folder.tracks.length ) {
			let fldr = TEMPLATES.folder.cloneNode( true ), trck;
			folder.tracks.sort( ( a, b ) => a.num - b.num ).forEach( track => {
				trck = TEMPLATES.track.cloneNode( true );
				trck.dataset.track_abs_path = track.abspath; // TODO reduce paths object size
				trck.dataset.title = track.title;
				trck.dataset.id = track.id;
				trck.firstElementChild.dataset.display = parseInt( track.num ) || 0;
				trck.lastElementChild.dataset.display = track.title;
				fldr.firstElementChild.append( trck );
			} );
			fldr.dataset.folder_struct = folder.path;
			trck.dataset.last_track = true;
			global__playlist_fragment.append( fldr );
			if ( end ) {
				DOM_PLAYLIST.append( global__playlist_fragment );
				updatePlaylistLength();
				sortPlaylist();
			}
		}
	},

	paths2Playlist = ( paths, stored ) => {
		stored = stored || [];
		return new Promise( resolve => {
			if ( paths?.length ) {

				// TODO reduce paths object size

				let folder = { "tracks": [], "path": "" }, mtch, pastpath;
				global__playlist_fragment = document.createDocumentFragment();
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
				} );
				collection2HTML( folder, true );
				resolve( stored.concat( paths ) );

				if ( !DOM_PLAYLIST_FILTER.querySelector( 'input[type="text"]' ) ) { // TODO derive from tags
					let fltr_prp, lgnd;
					[ "folder_struct", "title" ].forEach( col => {
						fltr_prp = TEMPLATES.playlist_filter.cloneNode( true );
						lgnd = fltr_prp.firstElementChild;
						lgnd.textContent = underspace( lgnd.dataset.data = col );
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
				if ( ctrlChckd( "respectsequences" ) && global__track_sequence.length ) {
					listing = global__track_sequence.shift();

					// TODO if ( untilEndOf( "queue" ) && the last track of the queue is sequenced and not the last track of that sequence ) { stop at the end of the sequence }

				} else {
					clear( "global__track_sequence" );
					let pl = global__played.length;
					if ( pl && playingPlayed() ) {
						listing = global__played[ pl + global__played_index ];
					} else {
						global__played_index = null;
						if ( global__queue.length ) {
							listing = global__queue.shift();

							// TODO if stop at the end of track lands here and the player is refreshed, the queue starts again at its next entry
								// a) was_queued = listing? a kind of honorary queue track to be cleared only when the track is ended or skipped
								// b) don't shift the queue here, but do it at track end? sounds complicated
								// while solving that;
									// address the crappy issue of not being able to stop at the end of the queue when the last track of the queue is playing

							global__queue_end = !global__queue.length;
							if ( listEditorShowing( "queue" ) ) {
								if ( global__queue_end ) {
									listEditorClick();
								} else {
									refreshListEditor();
								}
							}
							updateQueuetness();
						} else {
							let list;
							if ( ctrlChckd( "shuffle" ) ) {
								if ( isShuffleBy( "folder" ) ) {

								// TODO on startup (assuming we end up here) pick up where we left off
									// currently finds a new folder to start instead of carrying on with the last one, even if there are tracks remaining to play

									if ( global__current_playing_folder ) {
										let tof = tracksOfFolder( global__current_playing_folder ),
											lstndx = tof.indexOf( global__current_playing_track );
										if ( lstndx < minus1( tof.length ) ) {
											listing = tof[ plus1( lstndx ) ];
										} else {

											// TODO ctrlChckd( "recycle" )
												// ctrlChckd( "retrocycle" )?

											global__current_playing_folder.classList.add( "played" );
										}
									}
									if ( !listing ) {
										list = fromPlaylist.folders[ ( ctrlChckd( "skiplayed" ) ? "notPlayed" : "all" ) ]( ctrlChckd( "ignoreshufflefolder" ) );
										listing = tracksOfFolder( global__current_playing_folder = list[ randNum( list.length ) ], 0 );
									}
								} else {
									list = fromPlaylist.tracks[ ( ctrlChckd( "skiplayed" ) ? "notPlayed" : "all" ) ]( ctrlChckd( "ignoreshuffletrack" ) );
									listing = list[ randNum( list.length ) ];
								}
							} else {

								// TODO allow next and back folder when not shuffle playing

								// TODO allow skipping played tracks when not shuffle playing?

								list = fromPlaylist.tracks.all( ctrlChckd( "ignorenonshuffle" ) );
								let lstndx = list.indexOf( global__current_playing_track || notPop( global__played ) );
								listing = list[ ( ~lstndx ? lstndx + ( prev ? -1 : 1 ) : 0 ) ];
							}
						}
					}
					let si;
					if ( listing && ctrlChckd( "respectsequences" ) && ( si = parseInt( sequenced( listing ) ) ) ) {

						// TODO when playing played?

						global__track_sequence = tracksFromIDs( global__sequences[ minus1( si ) ] );
						clearQueueOf( global__track_sequence );
						listing = global__track_sequence.shift();
					}
					DOM_CONTROLS.classList.toggle( "show_cont_sequence", global__track_sequence.length );
				}
				if ( listing ) {
					DOM_AUDIO.src = `file:///${trackAbsPath( listing )}`;
					displayTrackData( listing );
				} else if ( untilEndOf( "world" ) && numberOfNotBrokenTracks() ) { // TODO check this won't infinite loop
					DOM_AUDIO.removeAttribute( "src" );
					displayTrackData();
					TRANSPORT.playTrack(); // TODO why is this here?
				}
			}
			resolve( true );
		} );
	},

	/* event functions */

	seekInput = evt => DOM_AUDIO.currentTime = evt.target.value,

	listEditorDragEnd = () => global__dragee.classList.remove( "dragee" ),

	liFromEvtPath = evt => evt?.composedPath().find( e => tagIs( e, "li" ) ),

	audioLoadedMediaData = () => DOM_CONTROLS.times.dataset.dura = seconds2Str( DOM_SEEK.control.max = Math.ceil( DOM_AUDIO.duration ) ),

	playedAfterChanged = evt => {
		debugMsg( "playedAfterChanged:", evt );

		// TODO something is very wrong; the change sometimes fires before the change

		setOp( "playedafter" );
		saveSettings();
	},

	dropzoneDragOver = evt => {
		debugMsg( "dropzoneDragOver:", evt );
		evt.preventDefault();
		evt.dataTransfer.dropEffect = "move";
	},

	listEditorDragStart = evt => {
		debugMsg( "listEditorDragStart:", evt );
		evt.dataTransfer.effectAllowed = "move";
		( global__dragee = evt.target ).classList.add( "dragee" );
	},

	wheel = evt => {
		let dlty = evt.deltaY,
			trg = evt.target;
		if ( tagIs( trg, "input", "range" ) ) {

			// TODO use wheel to adjust range values
				// the event listener currently commented out Fred ;)
		}
	},

	audioError = evt => {
		debugMsg( "audioError:", { "evt": evt, "global__current_playing_track": global__current_playing_track }, "error" );
		global__current_playing_track.classList.add( "broken" );
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
				CONTROLS[ fnc ]( ( fnc === "listEditor" ? ( listEditingQueue( trg ) ? global__queue : global__played ) : null ) ); // TODO sequence editor
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
		scroll2Track(); // TODO annoying
	},

	listEditorContextMenuClick = evt => {
		debugMsg( "listEditorContextMenuClick:", evt );
		let trg = evt.target,
			nme = trg.name;
		if ( isBtn( trg ) ) {
			if ( nme === "reveal" ) {
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
				li = tds.id ? tracksFromIDs( tds.id )[ 0 ] : DOM_PLAYLIST.querySelector( `li[data-folder_struct="${tds.folder}"]` );
			if ( li ) {
				DOM_LIST_EDITOR_CONTEXT_MENU.setAttribute( "style", `top:${Math.min( evt.y, Math.ceil( window.innerHeight - DOM_LIST_EDITOR_CONTEXT_MENU.offsetHeight ) )}px;left:${evt.x}px` );
				DOM_LIST_EDITOR_CONTEXT_MENU.li = li;
				DOM_LIST_EDITOR_CONTEXT_MENU.pffs.disabled = false;
				DOM_LIST_EDITOR_CONTEXT_MENU.classList.add( "show" );
			}
		}
	},

	playlistContextMenuClick = evt => {
		debugMsg( "playlistContextMenuClick:", evt );
		let trg = evt.target,
			nme = trg.name;
		if ( isBtn( trg ) ) {
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
		if ( !evt.nare && !debugging ) {
			evt.preventDefault();
		}
		DOM_PLAYLIST_CONTEXT_MENU.setAttribute( "style", `top:${Math.min( evt.y, Math.ceil( window.innerHeight - DOM_PLAYLIST_CONTEXT_MENU.offsetHeight ) )}px;left:${evt.x}px` );
		DOM_PLAYLIST_CONTEXT_MENU.google.title = googleSearch( DOM_PLAYLIST_CONTEXT_MENU.li = evt.li || liFromEvtPath( evt ), true );
		DOM_PLAYLIST_CONTEXT_MENU.pffs.disabled = false;
		DOM_PLAYLIST_CONTEXT_MENU.querySelector( `input[name="${ctrlVlu( "clicky" )}"]` ).focus();
		DOM_PLAYLIST_CONTEXT_MENU.classList.add( "show" );
	},

	// TODO combine the shit out of that shit

	audioTimeUpdate = () => {
		let curt = DOM_AUDIO.currentTime,
			tds = DOM_CONTROLS.times.dataset,
			pav = DOM_CONTROLS.playedafter.valueAsNumber,
			cpt = global__current_playing_track;
		if ( pav && ( curt >= pav ) && pav < parseInt( DOM_CONTROLS.playedafter.max ) && ( !cpt.classList.contains( "played" ) || cpt !== notPop( global__played ) ) ) {

			// TODO this is bullshit
				// cpt !== notPop( global__played ) <-- looks familiar -_-

			updatePlayedness( cpt );
		}
		tds.curt = seconds2Str( DOM_SEEK.control.value = curt );
		tds.rema = seconds2Str( ( DOM_AUDIO.duration - curt ) || 0 );
	},

	listEditorClick = evt => {

		// TODO all DOM_PLAYLIST click actions in DOM_LIST_EDITOR too?

		debugMsg( "listEditorClick:", evt );
		if ( evt && evt.target.name === "clear" ) {
			if ( listEditingQueue() ) {
				if ( global__queue.length && confirm( "Clear the queue?" ) ) {
					clear( "global__queue" );
				}
			} else if ( global__played.length && confirm( "Clear played tracks?" ) ) {
				clear( "global__played" );
			}
		}

		// TODO shuffle queued tracks

		if ( evt && evt.target && !evt.target.type ) {
			return;
		}
		DOM_LIST_EDITOR.classList.remove( "show" );
		DOM_LIST_EDITOR_LIST.innerHTML = "";
		DOM_LIST_EDITOR.pffs.disabled = true;
	},

	dropzoneDrop = evt => {
		evt.preventDefault();
		debugMsg( "dropzoneDrop:", evt );

		// TODO visual indication of where dropped stuff will end up
			// dropzoneDragOver

		// TODO keyboard list editing
			// pgUp pgDn etc?

		// TODO why shouldn't I be able to edit the order of global__played?
			// because it might be complicated ;)
			// playing played would go wild

		let q = listEditingQueue(),
			drop_target = evt.target,
			dragged_folder = global__dragee.firstElementChild,
			dragee_arr = ( dragged_folder ? arrayFrom( dragged_folder.children ) : [ global__dragee ] ).map( tm => {
				return ( q ? global__queue : global__played ).find( li => absPathsMatch( li, tm ) );
			} );

		if ( drop_target === DOM_LIST_EDITOR_TRASH ) {
			( q ? clearQueueOf : clearPlayedOf )( dragee_arr );
			refreshListEditor();
		} else if ( q ) { // TODO for now
			clearQueueOf( dragee_arr, true );
			if ( drop_target === DOM_LIST_EDITOR_LIST ) {
				global__queue.push( ...dragee_arr );
			} else {
				let dtfec = drop_target.firstElementChild;
				global__queue.splice( global__queue.findIndex( li => absPathsMatch( li, ( dtfec ? dtfec.lastElementChild : drop_target ) ) ), 0, ...dragee_arr );
			}
			updateQueuetness();
 			refreshListEditor();
		}
	},

	audioEnded = () => {

		// TODO it needs to be possible to set to stop at the end of {thing} while the last track of {thing} is playing

		let cpt = global__current_playing_track,
			cont = true;
		if ( cpt && playingPlayed() ) {
			++global__played_index;
		}
		DOM_AUDIO.removeAttribute( "src" );

		// TODO untilEndOf( "sequence" )
			// if a queue ends on a sequence and untilEndOf( "queue" ) is selected, the queue will be cleared, so convert to end after the sequence

		if ( global__queue_end && !global__queue.length && untilEndOf( "queue" ) ) {
			cont = global__queue_end = false;
		} else if ( untilEndOf( "track" ) || ( untilEndOf( "folder" ) && cpt && cpt.dataset.last_track ) ) {
			cont = false;
		}
		if ( cont ) {
			TRANSPORT.playTrack();
		} else {
			DOM_CONTROLS.times.dataset.dura = seconds2Str();
			selectNext().then( t => {
				setTitle( "[STOPPED]", true );
				setDefaultEndOf();
			} );
		}
		if ( cpt ) {
			updatePlayedness( cpt );
		}
	},

	playlistFilterInput = evt => {
		debugMsg( "playlistFilterInput:", evt );
		let frsh = ( fltrChckd( "onlyunplayed" ) ? ":not(.played)" : "" ),
			cs = ( fltrChckd( "casensitive" ) ? "" : " i" ),
			vlu, tag, mth,
			fltrs = arrayFrom( DOM_PLAYLIST_FILTER.querySelectorAll( 'input[type="text"]' ) ).map( npt => {
				vlu = npt.value.trim();
				if ( vlu ) {
					tag = npt.parentElement.querySelector( "legend" ).dataset.data;
					if ( npt.name === "contains" ) {
						vlu = vlu.split( " " ).map( str => `[data-${tag}*="${str}"${cs}]` ).join( "" );
						return `li${vlu}:not(.broken)${frsh}`;
					}
					return `li[data-${tag}${( npt.name === "starts" ? "^" : "$" )}="${vlu}"${cs}]:not(.broken)${frsh}`;
				}
			} ).filter( v => v ).join( ( fltrChckd( "combifilter" ) ? " " : "," ) ); // TODO combifilter won't work like this for more fields/tags;

		if ( fltrs.length ) {
			debugMsg( "playlistFilterInput - fltrs:", fltrs );

			// TODO for efficiency; only clear what isn't about to be filtered?

			clearFilters();

			DOM_PLAYLIST.classList.add( "filtered" );
			DOM_PLAYLIST.querySelectorAll( fltrs ).forEach( li => {
				li.classList.add( "filtered" );
				if ( !folderStruct( li ) ) {
					folderOfTrack( li ).classList.add( "filtered" );
				} else {
					li.querySelectorAll( `li${frsh}` ).forEach( li => li.classList.add( "filtered" ) );
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
				if ( trg !== DOM_CONTROLS.playedafter ) {
					if ( nme === "volume" ) {
						DOM_AUDIO.volume = parseFloat( vlu );
					} else if ( nme === "displaybrightness" ) {
						displayBrightness( vlu );
					}
					setOp( nme, vlu );
				}
			} else {
				if ( typ === "checkbox" ) {
					if ( nme === "scrolltoplaying" ) {
						DOM_BODY.classList.toggle( "scroll_to_playing", trg.checked );
						removeFocussed();
						scroll2Track();
					} else if ( nme === "smoothscrolling" ) {
						DOM_PLAYPEN.classList.toggle( "smooth_scrolling", trg.checked );
					}
				} else if ( typ === "radio" ) {
					if ( nme === "endof" && ( vlu === "world" || vlu === "list" ) ) {
						DOM_CONTROLS.dataset.defaultendof = vlu;
					}
				}
				toggleOptionsVisibility();
			}
			saveSettings();
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

				// TODO ctrlChckd( "ignoreenqueuefilter" )

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
				if ( !fltrd.length ) {
					return;
				}
				if ( isCtrlVlu( "clicky", "end" ) ) {
					global__queue.push( ...fltrd );
				} else {
					global__queue.unshift( ...fltrd );
				}
				if ( shuffle ) {
					shuffleArray( global__queue );
				}
				updateQueuetness();
			}
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
			let sp = slv.split( /\\|\//g ).filter( f => f ),
				paths = arrayFrom( trg.files ).filter( file => /^audio\//.test( file.type ) ).map( file => {
					let cp = sp.concat( file.webkitRelativePath.split( "/" ).filter( f => f ) );
					return {
						"a": cp.map( pp => encodeURIComponent( pp ) ).join( "/" ), // TODO reduce paths object size
						"f": cp.pop(),
						"d": cp.slice( plus1( sp.length ) ).join( " | " ),
						"i": ++global__track_id
					};
				} );
			if ( paths.length ) {
				STORAGE.get( async store => {
					paths = await paths2Playlist( paths, store.paths );
					if ( paths.length ) {

						// TODO only if something new is actually being added

						// TODO offer to store even if all the paths were already included in DOM_PLAYLIST

						// TODO provide some kind of progress indicator

						TRANSPORT.playTrack();
						let nl = { "lib_path": slv, "lib_name": libnme },
							libraries = ( store.libraries || [] ).filter( l => l.lib_path !== nl.lib_path ).concat( [ nl ] ); // TODO uniqueness must include selected folder
						setLibraries( libraries );
						STORAGE.set( { "libraries": libraries, "paths": paths } );

						// TODO sophisticate
							// new Promise( resolve => STORAGE.getBytesInUse( bytes => resolve( STORAGE.QUOTA_BYTES - bytes ) ) )
/*
STORAGE.getBytesInUse( bytes => {
	let quota = STORAGE.QUOTA_BYTES;
	console.log( `Quota: ${quota}, Bytes in use: ${bytes}, Difference: ${quota - bytes}` );
} );
*/
							// giveFile()
							// JSON.stringify etc.
					}
				} );
			}
		}
	},

	playlistClick = evt => {
		debugMsg( "playlistClick:", evt );

		// TODO all DOM_PLAYLIST click actions in DOM_LIST_EDITOR too?

		let trg = folder( evt.trg || liFromEvtPath( evt ) || fromPlaylist.focussed() );
		if ( trg ) {
			let cv = evt.clicky || ctrlVlu( "clicky" ),
				tia = trg.tracks,
				tau = tia || [ trg ];
			if ( cv === "delist" ) {

				// TODO playing tracks continue playing after being delisted O_o

				if ( confirm( `Remove this ${( tia ? "folder" : "track" )} from the playlist?` ) ) {

					// TODO reduce paths object size

					// TODO when sequenced tracks are removed from the playlist, the respective sequence needs to be adjusted or deleted
						// broken tracks...

					clearQueueOf( tau );
					clearPlayedOf( tau );
					clearSequenceOf( tau );
					clearIgnorablesOf( tau );
					STORAGE.get( store => {
						STORAGE.set( { "paths": store.paths.filter( sp => ( tia ? !tia.some( li => sp.a === trackAbsPath( li ) ) : sp.a !== trackAbsPath( trg ) ) ) } );
					} );
					if ( tia ) {
						trg.folder.remove();
					} else {
						trg.remove();
					}
					if ( ( tia && ~tia.indexOf( global__current_playing_track ) ) || trg === global__current_playing_track ) {
						TRANSPORT.nextTrack();
					}
					updatePlaylistLength();
				}
			} else if ( cv === "sequence" ) {

				// TODO can a track be part of more than one sequence?

				// TODO ctrlChckd( "ignoresequencefolder" )

				clearSequenceOf( tau, true );
				if ( !( !tia && /^NEW/.test( sequenced( trg ) ) ) ) { // TODO in lieu of a sequence editor?
					global__sequence.push( ...tau );
				}
				updateSequences();
			} else if ( cv === "unignorable" ) {
				clearIgnorablesOf( tau, true );
				if ( tia ) {
					if ( !( trg.tracks.filter( li => isIgnorable( li ) ).length >= ( trg.tracks.length * 0.5 ) ) ) {
						global__ignorable.push( ...tau );
					}
				} else if ( !isIgnorable( trg ) ) {
					global__ignorable.push( ...tau );
				}
				updateIgnorables();
			} else if ( cv === "unplayed" ) {
				clearPlayedOf( tau, true );
				if ( tia ) {
					if ( !( trg.folder.classList.contains( "played" ) || ( trg.tracks.filter( li => li.classList.contains( "played" ) ).length >= ( trg.tracks.length * 0.5 ) ) ) ) {
						global__played.push( ...tau );
					}
				} else if ( !trg.classList.contains( "played" ) ) {
					global__played.push( ...tau );
				}
				updatePlayedness();
			} else {

				// TODO allow the same track(s) in the queue more than once?

				// TODO if ( tia && ctrlChckd( "shuffle" ) ) offer to shuffle before adding folders to the queue?

				if ( tia && ctrlChckd( "ignoreenqueuefolder" ) ) {
					tau = tau.filter( li => !isIgnorable( li ) );
				}
				clearQueueOf( tau, true );
				if ( cv === "now" ) {
					if ( !tia && trg === global__current_playing_track ) {
						TRANSPORT.backTrack();
						return;
					}
					global__queue.unshift( ...tau );
					TRANSPORT.nextTrack();
				} else if ( cv === "next" ) {
					global__queue.unshift( ...tau );
				} else if ( cv === "end" ) {
					global__queue.push( ...tau );
				}
				updateQueuetness();
			}
		}
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
				all = fromPlaylist[ ( shft ? "folders" : "tracks" ) ].all();
			fcs = removeFocussed() || cloneArray( all ).sort( ( a, b ) => ( a.offsetTop - hpp ) + ( b.offsetTop - hpp ) )[ 0 ];
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
						case "[": {
							TRANSPORT.prevFolder();
							break;
						}
						case ";": {
							TRANSPORT.backFolder();
							break;
						}
						case "]": {
							TRANSPORT.nextFolder();
							break;
						}
					}
				}
			} else if ( document.activeElement.type !== "text" ) {
				switch ( k ) {
					case "Backspace": {
						removeFocussed();
						scroll2Track();
						break;
					}
					case "m": {
						if ( contextMenuShowing() ) {
							closeContextMenu();
						} else if ( no && ( fcs = fromPlaylist.focussed() || global__current_playing_track ) ) {
							playlistContextMenu( { nare: true, li: fcs, y: window.innerHeight * 0.5, x: window.innerWidth * 0.5 } );
						}
						break;
					}
					case "g": {
						googleSearch();
						break;
					}
					case "q": {
						CONTROLS.listEditor( global__queue );
						break;
					}
					case "p": {
						CONTROLS.listEditor( global__played );
						break;
					}
					case "s": {
						CONTROLS.sequencify();
						break;
					}
					case "[": {
						TRANSPORT.prevTrack();
						break;
					}
					case ";": {
						TRANSPORT.backTrack();
						break;
					}
					case ",": {
						TRANSPORT.pawsTrack();
						break;
					}
					case ".": {
						TRANSPORT.stopTrack();
						break;
					}
					case "]": {
						TRANSPORT.nextTrack();
						break;
					}
				}
			}
		}
	},

	mindTheStore = store => {
		return new Promise( resolve => {
			if ( store ) {
				let i = store.ignorable,
					s = store.sequences,
					p = store.played,
					q = store.queue;
				if ( q?.length ) {
					global__queue.push( ...tracksFromIDs( q ) );
					updateQueuetness();
				}
				if ( p?.length ) {
					global__played.push( ...tracksFromIDs( p ) );
					updatePlayedness();
				}
				if ( i?.length ) {
					global__ignorable.push( ...tracksFromIDs( i ) );
					updateIgnorables();
				}
				if ( s?.length ) {
					global__sequences.push( ...s ); // TODO tracksFromIDs?
					updateSequences();
				}
			}
			resolve( true );
		} );
	},

	saveSettings = () => STORAGE.set( { "settings": {
		ignoresequencefolder: ctrlChckd( "ignoresequencefolder" ),
		ignoreshufflefolder: ctrlChckd( "ignoreshufflefolder" ),
		ignoreenqueuefilter: ctrlChckd( "ignoreenqueuefilter" ),
		ignoreenqueuefolder: ctrlChckd( "ignoreenqueuefolder" ),
		ignoreshuffletrack: ctrlChckd( "ignoreshuffletrack" ),
		ignorenonshuffle: ctrlChckd( "ignorenonshuffle" ),
		respectsequences: ctrlChckd( "respectsequences" ),
		scrolltoplaying: ctrlChckd( "scrolltoplaying" ),
		smoothscrolling: ctrlChckd( "smoothscrolling" ),
		skiplayed: ctrlChckd( "skiplayed" ),
		wakeful: ctrlChckd( "wakeful" ),
		shuffle: ctrlChckd( "shuffle" ),
		recycle: ctrlChckd( "recycle" ),
		displaybrightness: ctrlVlu( "displaybrightness" ),
		displaycontrols: ctrlVlu( "switchControls" ),
		playedafter: ctrlVlu( "playedafter" ),
		shuffleby: ctrlVlu( "shuffleby" ),
		softstop: ctrlVlu( "softstop" ),
		clicky: ctrlVlu( "clicky" ),
		volume: ctrlVlu( "volume" ),
		endof: ctrlVlu( "endof" ),
		defaultendof: DOM_CONTROLS.dataset.defaultendof
	} } ),

	applySettings = settings => {
		return new Promise( resolve => {
			let sttngs = Object.assign( {
					ignoresequencefolder: false,
					ignoreshufflefolder: false,
					ignoreenqueuefilter: false,
					ignoreenqueuefolder: false,
					ignoreshuffletrack: false,
					ignorenonshuffle: false,
					recycle: false,
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
					playedafter: "21", // TODO hard coding this number/string is rubbish
					softstop: "0",
					volume: "0.5"
				}, settings || {} );

			// TODO reduce repeated code

			displayBrightness( setOp( "displaybrightness", DOM_CONTROLS.displaybrightness.value = sttngs.displaybrightness ) );

			DOM_BODY.classList.toggle( "display_controls_left", ( DOM_CONTROLS.switchControls.value = sttngs.displaycontrols ) === "RIGHT" );

			setOp( "volume", DOM_AUDIO.volume = parseFloat( DOM_CONTROLS.volume.value = sttngs.volume ) );
			setOp( "playedafter", DOM_CONTROLS.playedafter.value = sttngs.playedafter );
			setOp( "softstop", DOM_CONTROLS.softstop.value = sttngs.softstop );

			DOM_CONTROLS.smoothscrolling.checked = DOM_PLAYPEN.classList.toggle( "smooth_scrolling", sttngs.smoothscrolling );
			DOM_CONTROLS.scrolltoplaying.checked = DOM_BODY.classList.toggle( "scroll_to_playing", sttngs.scrolltoplaying );

			DOM_CONTROLS.ignoresequencefolder.checked = sttngs.ignoresequencefolder;
			DOM_CONTROLS.ignoreshufflefolder.checked = sttngs.ignoreshufflefolder;
			DOM_CONTROLS.ignoreenqueuefilter.checked = sttngs.ignoreenqueuefilter;
			DOM_CONTROLS.ignoreenqueuefolder.checked = sttngs.ignoreenqueuefolder;
			DOM_CONTROLS.ignoreshuffletrack.checked = sttngs.ignoreshuffletrack;
			DOM_CONTROLS.ignorenonshuffle.checked = sttngs.ignorenonshuffle;
			DOM_CONTROLS.respectsequences.checked = sttngs.respectsequences;
			DOM_CONTROLS.skiplayed.checked = sttngs.skiplayed;
			DOM_CONTROLS.wakeful.checked = sttngs.wakeful;
			DOM_CONTROLS.shuffle.checked = sttngs.shuffle;
			DOM_CONTROLS.recycle.checked = sttngs.recycle;

			DOM_CONTROLS.shuffleby.value = sttngs.shuffleby;
			DOM_CONTROLS.clicky.value = sttngs.clicky;
			DOM_CONTROLS.endof.value = sttngs.endof;

			DOM_CONTROLS.dataset.defaultendof = sttngs.defaultendof;

			toggleOptionsVisibility();

			DOM_WELCOME.addEventListener( "animationend", () => {

				// TODO introduction with walkthrough
				DOM_WELCOME.remove();

				resolve( true );

			}, { passive: true, once: true } );
		} );
	};

window.addEventListener( "keydown", keyDown );
//window.addEventListener( "wheel", wheel, { passive: false } ); // TODO ranges

DOM_AUDIO.addEventListener( "error", audioError, { passive: true } );
DOM_AUDIO.addEventListener( "ended", audioEnded, { passive: true } );
DOM_AUDIO.addEventListener( "timeupdate", audioTimeUpdate, { passive: true } );
DOM_AUDIO.addEventListener( "loadedmetadata", audioLoadedMediaData, { passive: true } );

DOM_SOURCES.addEventListener( "input", sourcesInput, { passive: true } );

DOM_CONTROLS.addEventListener( "click", controlsClick );
DOM_CONTROLS.addEventListener( "input", controlsInput, { passive: true } );

DOM_CONTROLS.playedafter.addEventListener( "change", playedAfterChanged, { passive: true } ); // TODO something is very wrong; the change sometimes fires before the change

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
