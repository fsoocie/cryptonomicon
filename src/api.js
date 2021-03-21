const API_KEY =
  "eeb255d1edccb58e6ffd64c87d5b26e54c6346ef4b6e1cc8faa4c3d053834a0f";
const AGGREGATE_INDEX = "5";
const tickerHandlers = new Map();
const socket = new WebSocket(
  `wss://streamer.cryptocompare.com/v2?api_key=${API_KEY}`
);

const sendToWebSocket = message => {
  const stringifyedMessage = JSON.stringify(message);

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(stringifyedMessage);
    return;
  }

  socket.addEventListener(
    "open",
    () => {
      socket.send(stringifyedMessage);
    },
    { once: true }
  );
};

socket.addEventListener("message", event => {
  const { TYPE: type, FROMSYMBOL: currency, PRICE: newPrice } = JSON.parse(
    event.data
  );

  if (type !== AGGREGATE_INDEX || newPrice === undefined) {
    return;
  }

  const handlers = tickerHandlers.get(currency) ?? [];
  handlers.forEach(fn => fn(newPrice));
});

const subscribeToTickerOnWs = ticker => {
  sendToWebSocket({
    action: "SubAdd",
    subs: [`5~CCCAGG~${ticker}~USD`]
  });
};

const unsubscribeFromTickerOnWs = ticker => {
  sendToWebSocket({
    action: "SubRemove",
    subs: [`5~CCCAGG~${ticker}~USD`]
  });
};

export const subscribeToTicker = (ticker, cb) => {
  const subscribers = tickerHandlers.get(ticker) || [];
  tickerHandlers.set(ticker, [...subscribers, cb]);
  subscribeToTickerOnWs(ticker);
};

export const unsubscribeFromTicker = ticker => {
  tickerHandlers.delete(ticker);
  unsubscribeFromTickerOnWs(ticker);
};

window.tickets = tickerHandlers;
