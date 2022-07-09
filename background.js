"use strict";

let tab_id;

const giveKISS = () => chrome.tabs.create( { "url": "kme.html", "active": true }, tab => tab_id = tab.id );

chrome.action.onClicked.addListener( tab => {
	if ( !tab_id ) {
  	giveKISS();
  } else {
  	chrome.tabs.update( tab_id, { "active": true }, tab => {
  		if ( chrome.runtime.lastError ) {
  			giveKISS();
  		}
  	} );
  }
});
