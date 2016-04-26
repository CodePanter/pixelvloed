#!/usr/bin/python
"""This is a udp / binary version of PixelFlut

Inspired by the PixelFlut beamer on eth0:winter 2016 and
code from https://github.com/defnull/pixelflut/
"""

__version__ = 0.2
__author__ = "Jan Klopper <jan@underdark.nl>"

import pygame
from pygame.locals import *
import struct
import time
from gevent import spawn, socket, monkey
from gevent.server import DatagramServer
from gevent.queue import Queue

monkey.patch_all()
UDP_IP = "127.0.0.1"
UDP_PORT= 5005
PROTOCOL_VERSION = 1
PROTOCOL_PREAMBLE = "pixelvloed"

def main():
  """Runs a pixelvloed server"""
  PixelVloed(':%d' %(UDP_PORT)).serve_forever()

class Canvas(object):
  """PixelVloed server class"""

  def __init__(self, queue, width=1366, height=768, debug=False):
    """Init the pixelVloed server"""
    self.debug = debug
    self.pixeloffset = 2
    self.fps = 30
    self.screen = None
    self.udp_ip = UDP_IP
    self.udp_port = UDP_PORT
    self.width = width
    self.height = height
    self.canvas()
    self.set_title()
    self.queue = queue
    self.limit = 140
    self.broadcastSocket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    self.broadcastSocket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    self.broadcastSocket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

  @staticmethod
  def set_title(text=None):
    """Sets the window title"""
    title = 'PixelVloed %0.02f' % __version__
    if text:
      title += ' ' + text
    pygame.display.set_caption(title)

  def canvas(self):
    """Init the pygame canvas"""
    pygame.init()
    pygame.mixer.quit()
    flags = DOUBLEBUF
    self.screen = pygame.display.set_mode((self.width, self.height), flags)

  def clear(self, r=0, g=0, b=0): # pylint: disable=C0103
    """ Fill the entire screen with a solid colour (default: black)"""
    self.screen.fill((r, g, b))

  def Pixel(self, x, y, r, g, b, a=255): # pylint: disable=C0103
    """Print a pixel to the screen"""
    try:
      self.pixels[x][y] = (r*256*256) + (g*256) + b
    except IndexError:
      pass

  def CanvasUpdate(self):
    """Updates the screen according to self.fps"""
    lasttime = time.time()
    lastbroadcast = time.time()
    changed = False
    while True:
      changed = self.Draw() or changed
      if time.time() - lastbroadcast > 2:
        lastbroadcast = time.time()
        self.SendDiscoveryPacket()

      if time.time() - lasttime >= 1.0 / self.fps and changed:
        self.pixels = None # release the lock on these pixels so we can flip
        pygame.display.flip()
        changed = False
        lasttime = time.time()
      else:
        time.sleep(1.0 / self.fps)

  def Draw(self):
    """Draws pixels specified in the received packages in the queue"""
    if self.queue.empty():
      # indicat that nothing was done, and w can skip flipping the screen
      return False
    #access the pixel array and lock it
    self.pixels = pygame.surfarray.pixels2d(self.screen)
    returntime = time.time() + (1.0 / self.fps)
    # while we have stuff in the queue, and its not our next time to draw a
    # frame, lets process packets from the queue
    while time.time() < returntime and not self.queue.empty():
      try:
        data = self.queue.get()
        preamble = struct.unpack_from("<?", data)[0]
        protocol = struct.unpack_from("<B", data, 1)[0]
        packetformat = ("<2H4B" if preamble else "<2H3B")
        pixellength = (8 #xx,yy,r,g,b,a
                       if preamble else
                       7 #xx,yy,r,g,b
                       )
        pixelcount = min(((len(data)-1) / pixellength),
                         self.limit)
        if self.debug:
          print '%d pixels received, protocol V %d ' % (pixelcount, protocol)
        for i in xrange(0, pixelcount):
          pixel = struct.unpack_from(
              packetformat,
              data,
              self.pixeloffset + (i*pixellength))
          if self.debug:
            print pixel
          self.Pixel(*pixel)
      except Exception as e:
        if self.debug:
          # All exceptions will be printed, but won't result in a crash.
          print e
    # indicate that we have been drawing stuff
    return True

  def SendDiscoveryPacket(self):
    """Lets send out our ip/port/resolution to any listening clients"""
    self.broadcastSocket.sendto(
        '%s:%f %s:%d %d*%d' % (PROTOCOL_PREAMBLE, PROTOCOL_VERSION,
                               UDP_IP, UDP_PORT,
                               self.width, self.height),
        ('<broadcast>', UDP_PORT+1))
    if self.debug:
      print 'sending discovery packet'

  def __del__(self):
    """Clean up any sockets we created"""
    self.broadcastSocket.close()

class PixelVloed(DatagramServer):
  """PixelVloed server class"""
  queue = Queue()
  pixelcanvas = Canvas(queue)
  __request_processing_greenlet = spawn(pixelcanvas.CanvasUpdate)

  def handle(self, data, address):
    """Is called by the DataGramServer whenever a package is received"""
    self.queue.put(data)

if __name__ == '__main__':
  main()
