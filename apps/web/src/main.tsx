import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter,Routes,Route } from 'react-router-dom';
import { Layout } from './layout';
import { Dashboard,Orders,NewOrder,OrderDetail,Documents,Agents,Executions,Audit,Integrations,Settings } from './pages';
import { SsoStart } from './sso-start';
import { CommercialSources } from './commercial-sources';
import { ProductCatalog } from './product-catalog';
import { PriceLists } from './price-lists';
import './style.css';
const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:10000,refetchOnWindowFocus:false}}});
function App(){return <QueryClientProvider client={queryClient}><BrowserRouter><Routes><Route path="/sso/start" element={<SsoStart/>}/><Route element={<Layout/>}><Route index element={<Dashboard/>}/><Route path="ordenes" element={<Orders/>}/><Route path="ordenes/nueva" element={<Orders/>}/><Route path="ordenes/:id" element={<OrderDetail/>}/><Route path="documentos" element={<Documents/>}/><Route path="fuentes-comerciales" element={<CommercialSources/>}/><Route path="maestro-productos" element={<ProductCatalog/>}/><Route path="listas-precios" element={<PriceLists/>}/><Route path="agentes" element={<Agents/>}/><Route path="ejecuciones" element={<Executions/>}/><Route path="integraciones" element={<Integrations/>}/><Route path="auditoria" element={<Audit/>}/><Route path="configuracion" element={<Settings/>}/><Route path="*" element={<div>Sección no encontrada</div>}/></Route></Routes></BrowserRouter></QueryClientProvider>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
