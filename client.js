// Install nodejs nodejs-legacy
// Install npm
// with npm install jspack
// with npm install sleep

// imports
var dgram = require('dgram');
var struct = require('jspack')['jspack'];
var sleep = require('sleep');

// static vars
var PROTOCOL_PREAMBLE = 'pixelvloed';
var DISCOVER_PORT = 5006;
var MAX_PROTOCOL_VERSION = 1;
var MAX_PIXELS = 140;
var UDP_PORT =  5005;

PixelVloedClient = {
  /*Sets up a client

  Arguments:
    firstserver: (bool) False, select the first server immediately
    debug: (bool) False
    ip: (str) None
    port: (int) None
    width: (int) 640
    height: (int) 480

  Listens for servers if no ip is given
  */
  discoverysock: null,
  sock: null,
  sleep: 100,
  debug: true,
  width: 640,
  height: 480,
  effect: null,
  alpha: false,

  init: function(firstserver, debug,
                 ip, port,
                 width, height,
                 effect, alpha){

    if(debug){ this.debug = debug; }
    if(effect){ this.effect = effect; }
    if(alpha){ this.alpha = alpha; }
    
    if (ip){
      this.ipaddress = ip;
      this.port = (port?port:UDP_PORT);
      this.width = width;
      this.height = height;
      this.start();
    } else {
      this.DiscoverServers(firstserver)
    }
  },

  start: function(){
    this.sock = dgram.createSocket('udp4');
    if (this.debug){
      console.log('displaying on '+this.ipaddress+':'+this.port+', '+this.width+'*'+this.height+'px');
    }
    this.effect();
  },
  
  Sleep: function(duration){
    // Sleeps the designated amount of time
    sleep.usleep((duration?duration:this.sleep) * 1000);
  },
  
  SendPacket: function(message, delay){
    /*Sends the message to the udp server

    Arguments:
      message: (str, 140)
      sleep:  (bool) True, should the client sleep for a while?
    */
    this.sock.send(message, 0, message.length, 
        this.port, this.ipaddress, 
        this.effect.bind(this));
    if (delay){
      sleep.usleep(this.sleep);    
    }
  },
 
  DiscoverServers: function (){
      //Discover servers that send out the pixelvloed preample
      this.discoverysock = dgram.createSocket("udp4");
      this.discoverysock.on("message", this.handleDiscoveryPacket.bind(this));

      this.discoverysock.on('error', function (err) {
        console.error(err);
        process.exit(0);
      });
      this.discoverysock.bind(DISCOVER_PORT);
  },
  
  handleDiscoveryPacket: function (data, rinfo) {
    data = String(data);
    console.log("server got: " + typeof String(data) + " from " + rinfo.address + ":" + rinfo.port);
    if (data.startsWith(PROTOCOL_PREAMBLE)){
      var dataset = data.split(' ');
      if (dataset[0].split(':')[1] <= MAX_PROTOCOL_VERSION){
        this.ipaddress = dataset[1].split(':')[0];
        this.port =  parseInt(dataset[1].split(':')[1], 10);
        this.width = parseInt(dataset[2].split('*')[0], 10);
        this.height = parseInt(dataset[2].split('*')[1], 10);
        this.discoverysock.close();
        this.start();
      }
    }
  } 
};

function NewMessage(alpha){
  // Creates a new message with the correct max size, rgb mode and version
  var message = new Buffer((MAX_PIXELS*(alpha?8:7))+2);
  message.fill(0);
  //MaxSizeList(+2);
  message[0] = SetRGBAMode(alpha);
  message[1] = SetVersionBit(1);
  return message;
}

function RGBPixel(message, offset, x, y, r, g, b, a){
  // Generates the packed data for a pixel
  message.writeUInt16LE(x, offset);
  message.writeUInt16LE(y, offset+2);
  message.writeUInt8(r, offset+4);
  message.writeUInt8(g, offset+5);
  message.writeUInt8(b, offset+6);
  if (a){
    message.writeUInt8(a, offset+7);
  }
}

function SetRGBAMode(mode){
  // Generate the rgb/rgba bit
  return struct.Pack("<B", [mode]);
}

function SetVersionBit(protocol){
  // Generate the Version bit
  return struct.Pack("<B", [protocol]);
}

function RandomFill(width, height){
  // Generates a random number of pixels with a random color
  var msg = NewMessage();
  for(var i=0; i<getRandomIntInclusive(10, MAX_PIXELS); i++){
    RGBPixel(msg, (i*(this.alpha?8:7))+2,
      getRandomIntInclusive(0, width),
      getRandomIntInclusive(0, height),
      getRandomIntInclusive(0, 255),
      getRandomIntInclusive(0, 255),
      getRandomIntInclusive(0, 255),
      (this.alpha?getRandomIntInclusive(0, 255):null))
  }
  return msg;
}

// Create a new client instance
var client = PixelVloedClient;
// bind the effect
client.effect = function(err, bytes){
  if (err) throw err;
  var msg = RandomFill(client.width, client.height);
  client.SendPacket(msg);
}
// Init the clients autodetection
client.init();

// helpers
function getRandomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// polyfills
if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(searchString, position){
      position = position || 0;
      return this.substr(position, searchString.length) === searchString;
  };
}
