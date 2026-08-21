import { getActiveUser, money } from '@gatsi/domain';
import { ArrowRight, Clock3, Droplets, Scissors, Shirt, Sparkles, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

const icons = { laundry: <Droplets />, dry_cleaning: <Shirt />, textile: <Scissors />, speciality: <Sparkles /> };
export function ServicesPage() {
  const { state } = useAppStore();
  const user = getActiveUser(state)!;
  return <><PageTitle eyebrow="Service catalogue" title="Garment care menu" description="Clear service pricing and expected turnaround times." actions={user.role === 'customer' ? <Link to="/pickup"><Button><Truck /> Book pickup</Button></Link> : <Link to="/orders/new"><Button>New order <ArrowRight /></Button></Link>} /><section className="service-banner"><div><span>Professional textile care</span><h2>Cleaned with precision.<br />Finished with care.</h2><p>Every order is tagged, assigned and visible from intake to collection.</p></div><span className="service-banner-icon"><Shirt /></span></section><div className="services-grid">{state.services.filter((item) => item.active).map((service) => <Card className="service-tile" key={service.id}><span>{icons[service.category]}</span><small>{service.category.replaceAll('_', ' ')}</small><h3>{service.name}</h3><p>{service.description}</p><div><strong>{money(service.price)} <small>/ {service.unit}</small></strong><em><Clock3 /> {service.turnaroundHours}h</em></div></Card>)}</div></>;
}
