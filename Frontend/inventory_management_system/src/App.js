import './App.css';
import Home from './components/Home';
import Navbar from './components/Navbar';
import Products from './components/Products';
import InsertProduct from './components/InsertProduct'
import UpdateProduct from './components/UpdateProduct';
import Users from './components/Users';
import InsertUser from './components/InsertUser';
import About from './components/About';

import {
  BrowserRouter as Router,
  Routes,
  Route
} from 'react-router-dom';




function App() {
  return (
    <div className="App">
      <Navbar title="Phong Pro" about="About"></Navbar>

      <Router>
        <Routes>
          <Route exact path="/" element={<Products />} />
          <Route path="/products" element={<Products />} />
          <Route path="/insertproduct" element={<InsertProduct />} />
          <Route path="/updateproduct/:id" element={<UpdateProduct />} />
          <Route path="/users" element={<Users />} />
          <Route path="/insertuser" element={<InsertUser />} />
          {/* <Route path="/about" element={<About />} /> */}

        </Routes>

      </Router>


    </div>
  );
}

export default App;
