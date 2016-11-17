/*  Part of SWISH

    Author:        Jan Wielemaker
    E-mail:        J.Wielemaker@cs.vu.nl
    WWW:           http://www.swi-prolog.org
    Copyright (C): 2016, VU University Amsterdam
			 CWI Amsterdam
    All rights reserved.

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

    1. Redistributions of source code must retain the above copyright
       notice, this list of conditions and the following disclaimer.

    2. Redistributions in binary form must reproduce the above copyright
       notice, this list of conditions and the following disclaimer in
       the documentation and/or other materials provided with the
       distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
    "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
    LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
    FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
    COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
    INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
    BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
    LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
    CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
    LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
    ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
    POSSIBILITY OF SUCH DAMAGE.
*/

/**
 * @fileOverview
 * Deal with cooperation
 *
 * @version 0.2.0
 * @author Jan Wielemaker, J.Wielemaker@vu.nl
 * @requires jquery
 */

define([ "jquery", "config", "preferences" ],
       function($, config, preferences) {

(function($) {
  var pluginName = 'chat';

  /** @lends $.fn.chat */
  var methods = {
    _init: function(options) {
      return this.each(function() {
	var elem = $(this);
	var data = {};			/* private data */

	elem.data(pluginName, data);	/* store with element */

	/* add event handling */
	elem.on("click", function(ev) {
	  var li = $(ev.target).closest("li.user");

	  if ( li.length == 1 )
	    elem.chat('unnotify', li.attr("id"));
	});
	elem.on("send", function(ev, msg) {
	  elem.chat('send', msg);
	});
	$(window).bind("beforeunload", function() {
	  elem.chat('disconnect');
	});

	/* setup websocket */
	if ( config.swish.chat ) {
	  elem.chat('connect');
	}
      });
    },

		 /*******************************
		 *	      WEBSOCKET		*
		 *******************************/

    /**
     * Create a websocket connection to /chat on the SWISH server.
     */
    connect: function() {
      var elem = this;
      var data = this.data(pluginName);
      var url  = window.location.host + config.http.locations.swish_chat;
      var avatar = preferences.getVal("avatar");

      if ( avatar )
	url += "?avatar=" + encodeURIComponent(avatar);

      data.connection = new WebSocket("ws://" + url, ['chat']);

      data.connection.onerror = function(error) {
	console.log('WebSocket Error ' + error);
      };
      data.connection.onmessage = function(e) {
	var msg = JSON.parse(e.data);
	msg.origin = e.origin;
	if ( msg.type )
	  elem.chat(msg.type, msg);
	else
	  console.log(e);
      };
      data.connection.onopen = function() {
	$(".storage").storage('chat_status');
      };
    },

    disconnect: function() {
      var data = this.data(pluginName);

      this.chat('send', {type: "unload"});
      data.connection.onclose = function(){};
      data.connection.close();
      data.connection = undefined;

      return this;
    },


		 /*******************************
		 *	   BASIC MESSAGES	*
		 *******************************/

    /**
     * @param {Object} msg is the JSON object to broadcast
     */
    send: function(msg) {
      var data = $(this).data(pluginName);

      if ( data && data.connection )
	data.connection.send(JSON.stringify(msg));

      return this;
    },

    subscribe: function(channel, sub_channel) {
      var msg = { type: "subscribe", channel: channel };

      if ( sub_channel )
	msg.sub_channel = sub_channel;

      this.chat('send', msg);
    },

    unsubscribe: function(channel, subchannel) {
      var msg = { type: "unsubscribe", channel: channel };

      if ( sub_channel )
	msg.sub_channel = sub_channel;

      this.chat('send', msg);
    },

		 /*******************************
		 *	      ACTIONS		*
		 *******************************/

    /**
     * The welcome message is sent by SWISH immediately after opening
     * the websocket connection.  It provides the session UID for this
     * user
     */
    welcome: function(e) {
      if ( !e.name )
	e.name = "Me";
      if ( e.avatar )
	preferences.setVal("avatar", e.avatar);
      this.chat('addUser', e);
    },

    /**
     * Replied when opening SWISH on a file to inform
     * the new user about existing visitors to same
     * files as are open in the current SWISH.  See
     * inform_newby_about_existing_gazers/2.
     */
    gazers: function(e) {
      if ( e.gazers ) {
	for(var i=0; i<e.gazers.length; i++) {
	  var gazer = e.gazers[i];
	  this.chat('addUser', gazer);
	}
      }
    },

    /**
     * Display a notification by some user.
     */
    notify: function(e) {
      this.chat('notifyUser', e);
    },

    /**
     * A user has left
     */
    left: function(e) {
      $("#"+e.wsid).hide(400, function() {this.remove();});
    },

		 /*******************************
		 *	        UI		*
		 *******************************/

    /**
     * Present a notification associated with a user
     *
     * @param {Object} options
     * @param {String} options.html provides the inner html of the message.
     * @param {Number} [options.fadeIn=400] provide the fade in time.
     * @param {Number} [options.fadeOut=400] provide the fade out time.
     * @param {Number} [options.time=5000] provide the show time.  The
     * value `0` prevents a timeout.
     */
    notifyUser: function(options) {
      var elm = $("#"+options.wsid);

      if ( elm.length == 0 )
	elm = this.chat('addUser', options);

      updateFiles(elm, options);

      if ( elm.length > 0 ) {
	var div  = $.el.div({ class:"notification notify-arrow",
			      id:"ntf-"+options.wsid
			    });
	var epos = elm.offset();

	$("body").append(div);
	$(div).html(options.html)
	      .css({ left: epos.left+elm.width()-$(div).outerWidth()-5,
		     top:  epos.top+elm.height()+5
		   })
	      .on("click", function(){$(div).remove();})
	      .show(options.fadeIn||400);
	if ( options.time !== 0 ) {
	  setTimeout(function() {
	    $(div).hide(options.fadeOut||400, function(){this.remove();});
	  }, options.time||5000);
	}
      }
    },

    unnotify: function(wsid) {
      $("#ntf-"+wsid).remove();
      return this;
    },

    /**
     * Add a new user to the notification area
     * @param {Object} [options]
     * @param {String} [options.name] is the name of the user
     */
    addUser: function(options) {
      var li = li_user(options.wsid, options);
      this.append(li);
      return $(li);
    }
  }; // methods

  /**
   * Add an entry for a user to the notification area
   */
  function li_user(id, options) {
    options = options||{};

    if ( !options.name )
      options.name = id;

    function avatar(options) {
      if ( options.avatar ) {
	return $.el.img({class:"avatar", src:options.avatar, alt:options.name});
      } else {
	return $.el.span({class:"avatar glyphicon glyphicon-user"})
      }
    }

    var li = $.el.li({class:"dropdown user", id:id},
		     $.el.a({ class:"dropdown-toggle avatar",
			      'data-toggle':"dropdown",
			    },
			    avatar(options),
			    $.el.b({class:"caret"})),
		     $.el.ul({ class:"dropdown-menu pull-right" },
			     $.el.li(options.name)));

    return li;
  }

  function updateFiles(li, options) {
    var ul   = li.find("ul.dropdown-menu");
    var file = options.event_argv[0];

    if ( options.event == "opened" )
      ul.append($.el.li({class:"file", "data-file":file}, file));
    else if ( options.event == "closed" )
      ul.find('li.file[data-file="'+file+'"]').remove();

    if ( ul.find('li.file').length == 0 )
      ul.hide(400, function() {this.remove();});
  }

  /**
   * <Class description>
   *
   * @class chat
   * @tutorial jquery-doc
   * @memberOf $.fn
   * @param {String|Object} [method] Either a method name or the jQuery
   * plugin initialization object.
   * @param [...] Zero or more arguments passed to the jQuery `method`
   */

  $.fn.chat = function(method) {
    if ( methods[method] ) {
      return methods[method]
	.apply(this, Array.prototype.slice.call(arguments, 1));
    } else if ( typeof method === 'object' || !method ) {
      return methods._init.apply(this, arguments);
    } else {
      $.error('Method ' + method + ' does not exist on jQuery.' + pluginName);
    }
  };
}(jQuery));
});
