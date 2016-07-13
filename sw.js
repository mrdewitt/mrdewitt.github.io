/* Copyright 2014 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

// While overkill for this specific sample in which there is only one cache,
// this is one best practice that can be followed in general to keep track of
// multiple caches used by a given service worker, and keep them all versioned.
// It maps a shorthand identifier for a cache to a specific, versioned cache
// name.

// Note that since global state is discarded in between service worker restarts,
// these
// variables will be reinitialized each time the service worker handles an
// event, and you
// should not attempt to change their values inside an event handler. (Treat
// them as constants.)

// If at any point you want to force pages that use this service worker to start
// using a fresh
// cache, then increment the CACHE_VERSION value. It will kick off the service
// worker update
// flow and the old cache(s) will be purged as part of the activate event
// handler when the
// updated service worker is activated.
var CACHE_VERSION = 1;
var CURRENT_CACHES = {
  font: 'font-cache-v' + CACHE_VERSION,
  api: 'api-cache-v' + CACHE_VERSION,
};

self.addEventListener('activate', function(event) {
  // Delete all caches that aren't named in CURRENT_CACHES.
  // While there is only one cache in this example, the same logic will handle
  // the case where
  // there are multiple versioned caches.
  var expectedCacheNames = Object.keys(CURRENT_CACHES).map(function(key) {
    return CURRENT_CACHES[key];
  });

  event.waitUntil(caches.keys().then(function(cacheNames) {
    return Promise.all(cacheNames.map(function(cacheName) {
      if (expectedCacheNames.indexOf(cacheName) === -1) {
        // If this cache name isn't present in the array of "expected" cache
        // names, then delete it.
        console.log('Deleting out of date cache:', cacheName);
        return caches.delete(cacheName);
      }
    }));
  }));
});

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

function serveFromCacheAfterDelay(request, delayInMS) {
  console.log("Searching cache", request.url);
  return caches.open(CURRENT_CACHES.api)
      .then(function(cache) {
        return cache.match(request);
      }).then(function(response) {
        if (response === undefined) {
          console.log("Cache miss", request.url);
          throw new Error("Cache miss.");
        }

        console.log("Cache hit", request.url, response.status);
        return delay(delayInMS).then(function() {
          return response;
        })
      });
}

function fetchAndCacheSuccess(request) {
  console.log("Fetching and then caching", request.url);
  return fetch(request)
      .then(function(response) {
        var clonedResponse = response.clone();
        if (response.status < 400) {
          console.log("Caching successful response", request.url, response.status);
          caches.open(CURRENT_CACHES.api).then(function(cache) {
            cache.put(request.clone(), clonedResponse);
          });
          return response;
        }
        console.log("Error fetching", request.url, response.status);
        var e = new Error("Fetch failure.");
        e.response = clonedResponse;
        throw e;
      });
}

function promiseAny(arrayOfPromises) {
  var failures = 0;
  var failureArray = [];
  var promises = arrayOfPromises.length;

  var failureFn = function(err) {
    failures += 1;
    failureArray.push(err);
    if (failures == promises) {
      debugger;
      var e = new Error("All promises failed. See all_errors property.");
      e.all_errors = failureArray;
      throw e;
    }
  };
  return new Promise(function(resolve, reject) {
    for (var p of arrayOfPromises) {
      p.then(resolve).catch(failureFn);
    }
  });
}

self.addEventListener('fetch', function(event) {
  if (event.request.url.match(/api\.fixer\.io/)) {
    event.respondWith(promiseAny([
      serveFromCacheAfterDelay(event.request.clone(), 100 /*ms*/),
      fetchAndCacheSuccess(event.request.clone()),
    ]).catch(function(error) {
      if (e.all_errors) {
        for (var inner_error of all_errors) {
          if (inner_error.response)
            return inner_error.response;
        }
      }
      throw error;
    }));
    return;
  }

  event.respondWith(caches.open(CURRENT_CACHES.font).then(function(cache) {
    return cache.match(event.request)
        .then(function(response) {
          if (response) {
            console.log(' Found response in cache:', response);
            return response;
          }

          return fetch(event.request.clone()).then(function(response) {
            if (response.status < 400 && response.headers.has('content-type') &&
                response.headers.get('content-type')
                    .match(/^application\/x-font|font\//i)) {
              console.log('  Caching the response to', event.request.url);
              cache.put(event.request, response.clone());
            } else {
              console.log('  Not caching the response to', event.request.url);
            }

            return response;
          });
        })
  }));
});
