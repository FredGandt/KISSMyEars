
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement

// TODO gapless playback

// TODO desktop notifications?

// TODO repeat queue or played?

// TODO player controls popout?

// TODO merge new imports into related folders

// TODO Google Search track context menu option

// TODO playlist_filter and queue_editor should not overlay together

// TODO convert queue to playlist
	// save playlists
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

// TODO skip silent sections in tracks i.e. leading to hidden tracks.
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
// https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode

"use strict";

let currently_playing_track,
	played_index = 0,
	queuend = false,
	played = [],
	queue = [],
	error_time,
	dragee,
	dropee;

const playlist_filter = document.getElementById( "playlist_filter" ),
	queue_editor = document.getElementById( "queue_editor" ),
	playlist = document.getElementById( "playlist" ),
	controls = document.getElementById( "controls" ),
	sources = document.getElementById( "sources" ),

	queue_editor_trash = queue_editor.querySelector( "div" ),
	queue_editor_list = queue_editor.querySelector( "ol" ),
	audio = document.querySelector( "audio" ),
	playpen = playlist.parentElement,

	TRANSPORT = {
		prev: () => {
			let pl = played.length;
			if ( pl ) {
				if ( Math.abs( played_index ) < pl ) {
					let paused = audio.paused,
						listing = played[ pl + --played_index ];
					TRANSPORT.stop( true );
					setTrackSrc( listing );
					pausiblyPlay( paused );
				}
			} else {
				TRANSPORT.next( true );
			}
		},

		back: () => audio.currentTime = 0,

		paws: () => {
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

		stop: rs => {
			if ( audio.src ) {
				audio.pause();
				TRANSPORT.back();
				if ( rs ) {
					audio.removeAttribute( "src" );
				} else {
					setTitle( "[STOPPED]", true );
				}
			}
		},

		play: prev => {
			selectNext( prev ).then( t => {
				if ( audio.src && audio.paused ) {
					audio.play();
					setTitle();
				}
			} );
		},

		next: prev => {
			let paused = audio.paused;
			TRANSPORT.stop( true );
			pausiblyPlay( paused, prev );
		}
	},

	CONTROLS = {
		queueEditor: () => {
			if ( !queue_editor.classList.contains( "show" ) ) {
				if ( queue.length ) {
					cloneNodeArrayTo( queue, queue_editor_list, true );
					queue_editor.classList.add( "show" );
				}
			} else {
				clickQueueEditor();
			}
		},

		clearPlayed: () => {
			if ( played.length && confirm( "Clear the play history?" ) ) {
				played = [];
				updatePlayedness();
			}
		}
	},

	notPop = arr => arr.slice( -1 )[ 0 ],

	arrayFrom = lst => Array.from( lst ),

	stringifiedArray = a => JSON.stringify( a ),

	randNum = n => Math.floor( n * Math.random() ),

	allButLast = arr => arrayFrom( arr ).slice( 0, -1 ),

	multiTrack = n => `${n} TRACK${n !== 1 ? "S" : ""}`,

	allTracks = () => arrayFrom( playlist.querySelectorAll( "ol li" ) ),

	brokenTracks = () => arrayFrom( playlist.querySelectorAll( "ol li.broken" ) ),

	cleanTitle = () => document.title.replace( /^(?:\[(?:PAUS|STOPP)ED\] )+/, "" ),

	goodTracks = () => arrayFrom( playlist.querySelectorAll( "ol li:not(.broken)" ) ),

	trackTitleDataset = listing => listing.querySelector( "span[data-title]" ).dataset,

	equalStringifiedArrays = ( a1, a2 ) => stringifiedArray( a1 ) === stringifiedArray( a2 ),

	queueMatch = dragee => queue.findIndex( li => li.dataset.abs_path === dragee.dataset.abs_path ),

	pathsToTracks = paths => paths.map( p => playlist.querySelector( `li[data-abs_path="${p}"]` ) ),

	setTitle = ( ttl, pp ) => document.title = ( ttl ? ttl + ( pp ? ` ${cleanTitle()}` : "" ) : cleanTitle() ),

	clearFilters = () => playlist.querySelectorAll( "li.filtered" ).forEach( l => l.classList.remove( "filtered" ) ),

	decodePaths = lis => arrayFrom( lis ).map( li => li.dataset.abs_path.split( "/" ).filter( ( pp, i ) => i && pp ).map( pp => decodeURIComponent( pp ) ) ),

	setTrackSrc = listing => {
		audio.src = listing.dataset.abs_path;
		displayTrackData( listing );
	},

	pausiblyPlay = ( paused, prev ) => {
		if ( paused ) {
			selectNext( prev );
		} else {
			TRANSPORT.play( prev );
		}
	},

	shuffleArray = arr => {
		arr.forEach( ( r, i ) => {
			r = randNum( i + 1 );
			[ arr[ i ], arr[ r ] ] = [ arr[ r ], arr[ i ] ];
		} );
	},

	updatePlaylistLength = () => {
		let btl = brokenTracks().length;
		if ( btl ) {
			controls.playlist_length.dataset.broken = ` + ${btl} BROKEN`;
			controls.fix.classList.add( "show" ); // TODO fixBrakages
		}
		controls.playlist_length.dataset.good = multiTrack( goodTracks().length );
	},

	setLibraries = libraries => {
		if ( libraries ) {
			sources.libraries.innerHTML = `<option value="" selected>add new library</option>` +
				libraries.map( ( l, i ) => `<option value="${l.path}" title="${l.path}">${l.name ? l.name : "Library " + (i + 1)}</option>` ).join( "" );
		}
	},

	showPlaying = () => {
		if ( currently_playing_track && controls.highlight.checked ) {
			playpen.scrollTo( 0, ( currently_playing_track.offsetTop - ( playpen.offsetHeight / 2 ) ) - playpen.offsetTop );
		}
	},

	closePlaylistFilter = () => {
		playlist_filter.classList.remove( "show" );
		playlist.classList.remove( "filtered" );
		playlist_filter.reset();
		clearFilters();
		showPlaying();
	},

	cloneNodeArrayTo = ( arr, to, md ) => {
		let clone;
		arr.forEach( n => {
			clone = n.cloneNode( true );
			if ( md ) {
				clone.draggable = true;
			}
			to.append( clone );
		} );
	},

	updatePlayedness = () => {
		let pl = played.length;
		playlist.querySelectorAll( "li.played" ).forEach( li => li.classList.remove( "played" ) );
		if ( pl ) {
			played.forEach( li => li.classList.add( "played" ) );
		}
		controls.played_length.dataset.pl = multiTrack( played.length );
	},

	updateQueuetness = () => {
		let ql = queue.length;
		playlist.querySelectorAll( 'span[data-queue]:not([data-queue=""])' ).forEach( xq => xq.dataset.queue = "" );
		if ( ql ) {
			queue.forEach( ( q, i ) => trackTitleDataset( q ).queue = ( i + 1 === ql ? ( ql === 1 ? "ONLY" : "LAST" ) : ( !i ? "NEXT" : i + 1 ) ) );
		}
		controls.queue_length.dataset.ql = multiTrack( ql );
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

	giveFile = ( name, text ) => {
		const blob = new Blob( [ text ], { type: "text/plain" } ),
			ourl = URL.createObjectURL( blob ),
			a = document.createElement( "a" );
		a.href = ourl;
		a.download = name;
		document.body.append( a );
		a.click();
		a.remove();
		URL.revokeObjectURL( ourl );
	},

	displayTrackData = listing => {
		if ( currently_playing_track ) {
			currently_playing_track.classList.remove( "playing" );
			currently_playing_track = null;
		}
		if ( listing ) {
			setTitle( listing.dataset.title );
			listing.classList.add( "playing" );
			currently_playing_track = listing;
			showPlaying();
		} else {
			setTitle( "KISS My Ears" );
			CONTROLS.clearPlayed();
		}
	},

	collectionToHTML = folder => { // TODO use tags to determine fields to create
		if ( folder && folder.tracks && folder.tracks.length ) {
			let ol = document.createElement( "ol" ),
				oli = document.createElement( "li" ),
				li, spn;
			oli.dataset.path = folder.path; // for applyPlaylistFilter
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
			playlist.append( oli );
		}
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
						queuend = !queue.length;
						if ( queue_editor.classList.contains( "show" ) ) {
							if ( queuend ) {
								clickQueueEditor();
							} else {
								queue_editor.querySelector( "ol li" ).remove();
							}
						}
						updateQueuetness();
					} else if ( controls.continuation.value !== "folder" ) {
						let list = goodTracks();
						if ( list.length ) {
							if ( controls.shuffle.checked ) {
								if ( controls.skiplayed.checked ) {
									list = list.filter( li => !~played.indexOf( li ) );
								}
								listing = list[ randNum( list.length ) ];
							} else {
								let lstndx = list.indexOf( currently_playing_track || notPop( played ) );
								listing = list[ ~lstndx ? lstndx + ( prev ? -1 : 1 ) : 0 ];
							}
						}
					} else { // TODO continuation folder
						let list = []; // goodFolders()
						if ( list.length ) {
							if ( controls.shuffle.checked ) {
								
							} else {

							}
						}
					}
				}
				if ( listing ) {
					setTrackSrc( listing );
				} else if ( controls.continuation.value === "world" && goodTracks().length ) {
					// TODO reset all the things
					audio.removeAttribute( "src" );
					displayTrackData();
					TRANSPORT.play();
				}
			}
			resolve( true );
		} );
	},

	pathsToPlaylist = ( paths, stored ) => {
		return new Promise( resolve => {
			if ( paths ) {
				if ( stored && stored.length ) {
					let spp, ppp;
					paths = paths.filter( pp => {
						ppp = pp.path;
						return !stored.some( sp => notPop( ppp ) === notPop( spp = sp.path ) && equalStringifiedArrays( spp, ppp ) );
					} );
				}
				if ( paths.length ) {
					let mtch, abspath, pastpath, prettypath,
						folder = { "tracks": [], "path": "" },
						alltrcks = allTracks();
					paths = paths.map( path => {
						abspath = `file:///${path.path.map( pp => encodeURIComponent( pp ) ).join( "/" )}`;
						if ( alltrcks.length && alltrcks.some( li => li.dataset.abs_path === abspath ) ) {
							return null;
						}
						prettypath = allButLast( path.path ).slice( path.sp ).join( " | " );
						if ( pastpath !== prettypath ) {
							pastpath = prettypath;
							collectionToHTML( folder );
							folder = { "tracks": [], "path": "" };
						}
						folder.path = prettypath;
						if ( mtch = notPop( path.path ).match( /^([0-9]+)?[ \-]*(.+)\.([a-z0-9]+)$/ ) ) {
							folder.tracks.push( {
								"abspath": abspath,
								"title": mtch[ 2 ],
								"type": mtch[ 3 ],
								"num": mtch[ 1 ]
							} );
						} else {
							console.warn( "Unprocessable file name format: ", path );
						}
						return path;
					} );
					collectionToHTML( folder );
					requestAnimationFrame( updatePlaylistLength );
					if ( !playlist_filter.querySelector( 'input[type="text"]' ) ) { // TODO derive from tags
						let tmplt = document.querySelector( "template" ), guts;
						[ "path", "title" ].forEach( col => {
							guts = tmplt.content.firstElementChild.cloneNode( true );
							guts.firstElementChild.textContent = col.toUpperCase();
							playlist_filter.append( guts );
						} );
					}
					if ( stored ) {
						TRANSPORT.play();
					}
				}
				resolve( ( stored || [] ).concat( paths.filter( p => p ) ) );
			}
		} );
	},

	/* event functions */

	dragEnd = () => dragee.classList.remove( "dragee" ),

	dragStart = evt => {
		evt.dataTransfer.effectAllowed = "move";
		dragee = evt.target;
	},

	setTrackDuration = () => {
		let dura = audio.duration;
		controls.times.dataset.dura = secondsToStr( controls.seek.max = Math.ceil( dura ) );
	},

	trackTimeUpdate = () => {
		let curt = audio.currentTime;
		controls.times.dataset.curt = secondsToStr( controls.seek.value = curt );
		controls.times.dataset.rema = secondsToStr( ( audio.duration - curt ) || 0 );
	},

	liFromEvtPath = evt => {
		let li = evt.composedPath().find( e => e.tagName && e.tagName.toLowerCase() === "li" );
		if ( li.dataset.path ) {
			return { "folder": li, "tracks": arrayFrom( li.querySelectorAll( "li" ) ) };
		}
		return li;
	},

	fixBrakages = () => console.warn( "fixBrakages", brokenTracks() ),

	trackError = evt => {
		let cet = evt.timeStamp;
		if ( !error_time || ( cet - error_time ) > 1000 ) {
			console.error( "trackError", currently_playing_track, evt );

			currently_playing_track.classList.add( "broken" );
			updatePlaylistLength();
			TRANSPORT.next();

			// TODO offer to remove or do it automatically and give notice?
				// fixBrakages

		}
	},

	dragOver = evt => {
		// console.log( "dragOver", evt );

		// TODO scrolling when outside zone
		// evt.offsetY

		// if queue_editor height is greater than the available space i.e. is scrollable
			// if the drag is near the top and the scroll isn't topped out
			// or if the drag is near the bottom and the scroll isn't bottomed out
				// scroll faster the nearer the edge gets

		evt.preventDefault();
		dropee = liFromEvtPath( evt );
		dragee.classList.add( "dragee" );
		evt.dataTransfer.dropEffect = "move";
	},

	clickControls = evt => {
		// console.log( "clickControls", evt );
		let trg = evt.target;
		if ( trg.type === "button" ) {
			let fnc = trg.name;
			if ( CONTROLS.hasOwnProperty( fnc ) ) {
				CONTROLS[ fnc ]();
			}
		}
	},

	clickTransport = evt => {
		// console.log( "clickTransport", evt );
		let trg = evt.target;
		evt.stopPropagation();
		if ( trg.type === "button" ) {
			let fnc = trg.name;
			if ( TRANSPORT.hasOwnProperty( fnc ) ) {
				TRANSPORT[ fnc ]();
			}
		}
	},

	playlistFilter = () => {
		if ( goodTracks().length ) {
			if ( playlist_filter.classList.toggle( "show" ) ) {
				playlist_filter.querySelector( 'input[name="contains"]' ).focus();
				playlist.classList.add( "filtered" );
				return;
			}
		}
		closePlaylistFilter();
	},

	clickQueueEditor = evt => {
		// console.log( "clickQueueEditor", evt );
		if ( evt && evt.target.name === "clear" && queue.length && confirm( "Clear the queue?" ) ) {
			queue = [];
			updateQueuetness();
		}
		if ( evt && evt.target && !evt.target.type ) {
			return;
		}
		queue_editor.classList.remove( "show" );
		queue_editor_list.innerHTML = "";
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

	inputControls = evt => {
		// console.log( "inputControls", evt );
		let trg = evt.target,
			vlu = trg.value,
			typ = trg.type,
			nme = trg.name;
		if ( typ === "range" ) {
			if ( nme === "volume" ) {
				audio.volume = trg.valueAsNumber;
			} else {
				audio.currentTime = vlu;
			}
		} else if ( typ === "checkbox" ) {
			if ( nme === "highlight" ) {
				showPlaying();
			}
		} else if ( typ === "radio" ) {
			if ( nme === "continuation" && ( vlu === "world" || vlu === "list" ) ) {
				controls.dataset.continuation = vlu;
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
				let movie = queue.splice( queueMatch( dragee ), 1 )[ 0 ];
				if ( trg === queue_editor_list ) {
					queue_editor_list.append( dragee );
					queue.push( movie );
				} else {
					queue_editor_list.insertBefore( dragee, dropee );
					queue.splice( queueMatch( dropee ), 0, movie );
				}
			}
			updateQueuetness();
		}
	},

	clearPlaylist = () => {
		if ( allTracks().length && confirm( "Clear the playlist?" ) ) {
			TRANSPORT.stop( true );
			playlist.innerHTML = "";
			setTitle( "KISS My Ears" );
			updatePlaylistLength();
			controls.times.dataset.dura = controls.times.dataset.rema = secondsToStr( 0 );
		}
		chrome.storage.local.get( store => {
			if ( store.paths && confirm( "Clear the automatically included tracks?" ) ) {
				chrome.storage.local.remove( "paths" );
			}
			if ( store.libraries && confirm( "Clear the stored libraries?" ) ) {
				chrome.storage.local.remove( "libraries" );
			}
		} );
	},

	keyDown = evt => {
		// console.log( "keyDown", evt );
		if ( evt.target === document.body ) {
			let k = evt.key;
			if ( evt.ctrlKey ) {
				if ( k === "f" ) {
					evt.preventDefault();
					playlistFilter();
				} else if ( k === "q" ) {
					CONTROLS.queueEditor();
				}
			} else if ( k === " " ) {
				TRANSPORT.paws();
			} else if ( k === "PageUp" ) {
				playpen.scrollBy( 0, -playpen.offsetHeight );
			} else if ( k === "ArrowUp" ) {
				playpen.scrollBy( 0, -20 );
			} else if ( k === "PageDown" ) {
				playpen.scrollBy( 0, playpen.offsetHeight );
			} else if ( k === "ArrowDown" ) {
				playpen.scrollBy( 0, 20 );
			}
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
		if ( controls.continuation.value === "queue" && !queue.length && queuend ) { // TODO continuation folder
			cont = queuend = false;
		} else if ( controls.continuation.value === "track" ) {
			cont = false;
		}
		if ( cont ) {
			TRANSPORT.play();
		} else {
			selectNext().then( t => {
				setTitle( "[STOPPED]", true );
				controls.continuation.value = controls.dataset.continuation;
			} );
		}
	},

	applyPlaylistFilter = evt => {
		// console.log( "applyPlaylistFilter", evt );
		let fltrs = arrayFrom( playlist_filter.querySelectorAll( 'input[type="text"]' ) ).filter( f => f.value );
		if ( fltrs.length ) {
			let fresh = ( playlist_filter.onlyunplayed.checked ? ":not(.played)" : "" ), // TODO skiplayed?
				insens = ( playlist_filter.casensitive.checked ? "" : " i" ), tag, mth,
				fltr = fltrs.map( npt => {
					tag = npt.parentElement.querySelector( "legend" ).textContent.toLowerCase();
					mth = { "starts": "^", "contains": "*", "ends": "$" }[ npt.name ];
					return `li[data-${tag}${mth}="${npt.value}"${insens}]:not(.broken)${fresh}`;
				} ).join( playlist_filter.combifilter.checked ? " " : "," );
			// TODO console.log( fltr ); // combifilter won't work like this for more fields/tags
			clearFilters();
			playlist.querySelectorAll( fltr ).forEach( li => {
				li.classList.add( "filtered" );
				if ( li.dataset.title ) {
					li.parentElement.parentElement.classList.add( "filtered" );
				} else {
					li.querySelectorAll( `li${fresh}` ).forEach( li => li.classList.add( "filtered" ) );
				}
			} );
		}
	},

	clickPlaylistFilter = evt => {
		// console.log( "clickPlaylistFilter", evt );
		let trg = evt.target;
		if ( trg.type === "button" ) {
			let nme = trg.name;
			if ( nme === "done" ) {
				closePlaylistFilter();
			} else if ( nme === "toqueue" ) {
				let fltrd = arrayFrom( playlist.querySelectorAll( "ol li.filtered" ) ),
					shuffle = false;
				if ( fltrd.length && fltrd.filter( f => trackTitleDataset( f ).queue ).length && confirm( "Exclude tracks already in the queue?" ) ) {
					fltrd = fltrd.filter( f => !trackTitleDataset( f ).queue );
				}
				if ( fltrd.length > 1 && controls.shuffle.checked ) { // TODO skiplayed?
					if ( confirm( "Shuffle tracks before appending to the queue?" ) ) {
						shuffleArray( fltrd );
					} else {
						shuffle = confirm( "Shuffle the entire resultant queue?" );
					}
				}
				if ( !fltrd.length ) return;
				if ( controls.clicky.value !== "delist" ) {
					if ( controls.clicky.value === "end" ) {
						queue = queue.concat( fltrd );
					} else {
						queue = fltrd.concat( queue );
					}
				} else {
					// TODO delisting which?
				}
				if ( shuffle ) {
					shuffleArray( queue );
				}
				updateQueuetness();
			}
		}
	},

	importFiles = evt => {
		// console.log( "importFiles", evt );
		let trg = evt.target;
		if ( trg.name === "include" ) {
			let ln, sp, wrp, paths,
				slv = sources.libraries.value;
			if ( slv ) {
				slv = `[${sources.libraries.querySelectorAll( "option" )[ sources.libraries.selectedIndex ].textContent}]${slv}`;
			}

			// TODO "along this path" should allow e.g. HDD + child/path
			// TODO since removing files input, possibly simplify

			sp = ( slv || sources.path.value ).replace( /^\[([a-z0-9 ]+)\]/gi, ( m, g1 ) => { ln = g1; return ""; } ).split( "/" ).filter( f => f );
			paths = arrayFrom( trg.files ).filter( file => /^audio\//.test( file.type ) ).map( file => {
				wrp = file.webkitRelativePath;
				return {
					"path": sp.concat( wrp ? allButLast( wrp.split( "/" ) ) : [] ).concat( [ file.name ] ),
					"sp": sp.length
				};
			} );
			if ( paths.length ) {
				chrome.storage.local.get( async store => {
					paths = await pathsToPlaylist( paths, store.paths );

					// TODO offer to store even if all the paths were already included in playlist
					// TODO provide some kind of progress indicator

					if ( paths.length && confirm( "Remember these files for automatic inclusion in future?" ) ) {
						chrome.storage.local.getBytesInUse( bytes => {
							let nl = { "path": sp.join( "/" ), "name": ln },
								libraries = ( store.libraries || [] ).filter( l => l.path !== nl.path ).concat( [ nl ] ),
								json = JSON.stringify( paths );
							setLibraries( libraries );
							if ( json.length <= ( chrome.storage.local.QUOTA_BYTES - JSON.stringify( Object.assign( {}, {
									"settings": store.settings,
									"libraries": libraries,
									"played": store.played,
									"queue": store.queue
								} ) ).length
							) ) {
								chrome.storage.local.set( { "libraries": libraries, "paths": paths } );
							} else if ( confirm( `There are too many files to remember. An alternative method exists.
Would you like to store the information as a file to be saved in your audio library?` ) ) {
								giveFile( "store", json ); // TODO and then what?
							}
						} );
					}
				} );
			}
			sources.reset();
		}
	},

	clickPlaylist = evt => {
		// console.log( "clickPlaylist", evt );
		let trg = liFromEvtPath( evt );
		if ( trg ) {
			let cv = controls.clicky.value,
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

			// TODO if a queued track has been delisted, make sure the further options are clearly indicated as not required

			if ( cv === "delist" ) {
				if ( confirm( `Remove this ${tia ? "folder" : "track"} from the playlist?` ) ) {
					if ( confirm( "Do not automatically include in future?" ) ) {
						chrome.storage.local.get( store => {
							let dcdtrg = decodePaths( tia ? trg.tracks : [ trg ] );
							chrome.storage.local.set( { "paths": store.paths.filter( sp => {
								if ( tia ) {
									return !dcdtrg.some( p => equalStringifiedArrays( sp.path, p ) );
								}
								return !equalStringifiedArrays( sp.path, dcdtrg[ 0 ] );
							} ) } );
						} );
					}
					if ( ( tia && ~trg.tracks.indexOf( currently_playing_track ) ) || trg === currently_playing_track ) {
						TRANSPORT.next();
					}
					if ( !tia ) {
						played = played.filter( li => li !== trg );
						trg.remove();
					} else {
						played = played.filter( li => !~trg.tracks.indexOf( li ) );
						trg.folder.remove();
					}
					updatePlaylistLength();
					updatePlayedness();
				}
			} else if ( cv === "now" ) {
				if ( !tia && trg === currently_playing_track ) {
					TRANSPORT.back();
					return;
				}
				if ( tia ) {
					queue = trg.tracks.concat( queue );
				} else {
					queue.unshift( trg );
				}
				TRANSPORT.next();
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

	storeSettings = evt => {
		chrome.storage.local.set( {
			"played": played.map( li => li.dataset.abs_path ), // TODO check if there's enough space; if not?
			"queue": queue.map( li => li.dataset.abs_path ),
			"settings": {
				combifilter: playlist_filter.combifilter.checked,
				casensitive: playlist_filter.casensitive.checked,
				continuation: controls.dataset.continuation,
				highlight: controls.highlight.checked,
				volume: controls.volume.valueAsNumber,
				skiplayed: controls.skiplayed.checked,
				shuffleby: controls.shuffle_by.value,
				shuffle: controls.shuffle.checked,
				clicky: controls.clicky.value
			}
		} );
	},

	applySettings = settings => {
		return new Promise( resolve => {
			let sttngs = Object.assign( {
				continuation: "world",
				combifilter: false,
				casensitive: false,
				shuffleby: "track",
				highlight: true,
				skiplayed: true,
				shuffle: true,
				clicky: "end",
				volume: 0.5
			}, settings || {} );
			controls.dataset.continuation = controls.continuation.value = sttngs.continuation;
			playlist_filter.combifilter.checked = sttngs.combifilter;
			playlist_filter.casensitive.checked = sttngs.casensitive;
			audio.volume = controls.volume.value = sttngs.volume;
			controls.highlight.checked = sttngs.highlight;
			controls.skiplayed.checked = sttngs.skiplayed;
			controls.shuffle_by.value = sttngs.shuffleby;
			controls.shuffle.checked = sttngs.shuffle;
			controls.clicky.value = sttngs.clicky;
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

controls.fix.addEventListener( "click", fixBrakages );
controls.filter.addEventListener( "click", playlistFilter );
controls.addEventListener( "input", inputControls, { passive: true } );
controls.addEventListener( "click", clickControls, { passive: true } );
controls.clear.addEventListener( "click", clearPlaylist, { passive: true } );
controls.transport.addEventListener( "click", clickTransport, { passive: true } );

playlist.addEventListener( "click", clickPlaylist, { passive: true } );

playlist_filter.addEventListener( "input", applyPlaylistFilter, { passive: true } );
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
				TRANSPORT.play();
			} );
		} );
	} );
} );
