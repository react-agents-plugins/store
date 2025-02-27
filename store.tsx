import React, { useState, useEffect, useContext, useMemo, createContext, ReactNode } from 'react';
import dedent from 'dedent';
import {
  PendingActionEvent,
} from '../../types';
import {
  useAgent,
  useStoreItems,
} from '../../hooks';
import { Action } from '../core/action';
import {
  AgentContext,
  AgentRegistryContext,
} from '../../context';
import {
  storeItemType,
} from '../../util/agent-features-spec.mjs';
import {
  currencies,
  intervals,
} from '../../constants.mjs';

type Currency = 'usd';
type Interval = 'day' | 'week' | 'month' | 'year';
type PaymentProps = {
  amount: number;
  currency: Currency;
  name: string;
  description?: string;
  previewUrl?: string;
};
type SubscriptionProps = {
  amount: number;
  currency: Currency;
  name: string;
  description?: string;
  previewUrl?: string;
  interval: Interval;
  intervalCount: number;
};
type StoreProps = {
  payments: PaymentProps[];
  subscriptions: SubscriptionProps[];
};

const Payment = (props: PaymentProps) => {
  const agent = useContext(AgentContext);
  const agentRegistry = useContext(AgentRegistryContext).agentRegistry;
  const symbol = useMemo(Symbol, []);

  const deps = [
    props.amount,
    props.currency,
    props.name,
    props.description,
    props.previewUrl,
  ];

  useEffect(() => {
    agentRegistry.registerPayment(symbol, props);
    return () => {
      agentRegistry.unregisterPayment(symbol);
    };
  }, deps);

  agent.useEpoch(deps);

  return null;
};
const Subscription = (props: SubscriptionProps) => {
  const agent = useContext(AgentContext);
  const agentRegistry = useContext(AgentRegistryContext).agentRegistry;
  const symbol = useMemo(Symbol, []);

  const deps = [
    props.amount,
    props.currency,
    props.name,
    props.description,
    props.previewUrl,
  ];

  useEffect(() => {
    agentRegistry.registerSubscription(symbol, props);
    return () => {
      agentRegistry.unregisterSubscription(symbol);
    };
  }, deps);

  agent.useEpoch(deps);

  return null;
};

// XXX this needs to be run whenever there is a store item
const StoreActions = () => {
  const agent = useAgent();
  const storeItems = useStoreItems();
  return (
    <>
      {!!agent.stripeConnectAccountId && storeItems.length > 0 && (
        <Action
          type="paymentRequest"
          description={dedent`\
            Request payment or a subscription for an item available in the store.
          `}
          schema={storeItemType}
          examples={[
            {
              type: 'payment',
              props: {
                name: 'potion',
                description: 'Heals 50 HP',
                amount: 1,
                currency: currencies[0],
              },
            },
            {
              type: 'subscription',
              props: {
                name: 'Blessing',
                description: 'Get daily blessings delivered in your DMs',
                amount: 1,
                currency: currencies[0],
                interval: intervals[0],
                intervalCount: 1,
              },
            },
          ]}
          handler={async (e: PendingActionEvent) => {
            const {
              stripeConnectAccountId,
            } = e.data.agent.agent;
            (e.data.message.args as any).stripeConnectAccountId = stripeConnectAccountId;

            await e.commit();
          }}
        />
      )}
    </>
  );
};

interface OneContextType {
  register: () => number;
  unregister: (id: number) => void;
  activeId: number | null;
}
const OneContext = createContext<OneContextType | null>(null);
const OneProvider = ({ children }: { children: ReactNode }) => {
  const [components, setComponents] = useState<number[]>([]);
  const [nextId, setNextId] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);

  const register = () => {
    const id = nextId;
    setNextId(prev => prev + 1);
    
    setComponents(prev => {
      const newComponents = [...prev, id];
      // Set the first registered component as active if none is active
      if (activeId === null && newComponents.length === 1) {
        setActiveId(id);
      }
      return newComponents;
    });
    
    return id;
  };

  const unregister = (id: number) => {
    setComponents(prev => {
      const newComponents = prev.filter(compId => compId !== id);
      
      // If the active component is being removed, set the first available as active
      if (id === activeId) {
        setActiveId(newComponents.length > 0 ? newComponents[0] : null);
      }
      
      return newComponents;
    });
  };

  return (
    <OneContext.Provider value={{ register, unregister, activeId }}>
      {children}
    </OneContext.Provider>
  );
};

const useOneStore = () => {
  const context = useContext(OneContext);
  if (!context) {
    throw new Error('useOneStore must be used within a OneProvider');
  }
  return context;
};

const One = ({ children }: { children: ReactNode }) => {
  const { register, unregister, activeId } = useOneStore();
  const [id, setId] = useState<number | null>(null);
  
  useEffect(() => {
    const componentId = register();
    setId(componentId);
    
    return () => {
      unregister(componentId);
    };
  }, []);
  
  // Only render children if this component is the active one
  return (
    <>
      {id !== null && id === activeId && children}
    </>
  );
};

export const Store = (props: StoreProps) => {
  const {
    payments,
    subscriptions,
  } = props;

  return (
    <>
      <OneProvider>
        <One>
          <StoreActions />
        </One>
      </OneProvider>
      {payments.map((payment, i) => {
        return (
          <Payment {...payment} key={i} />
        );
      })}
      {subscriptions.map((subscription, i) => {
        return (
          <Subscription {...subscription} key={i} />
        );
      })}
    </>
  );
};