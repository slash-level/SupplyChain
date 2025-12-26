import React from 'react';
import { Nav } from 'react-bootstrap';
import { Requirement } from '../App'; // Import the Requirement type

interface SidebarProps {
  groupedRequirements: { [key: string]: { [key: string]: Requirement[] } };
}

const Sidebar: React.FC<SidebarProps> = ({ groupedRequirements }) => {
  const handleScrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="pt-3">
      <Nav className="flex-column">
        <Nav.Item>
          <Nav.Link onClick={() => handleScrollTo('progress-summary')} href="#progress-summary">
            進捗サマリー
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link onClick={() => handleScrollTo('dashboard-section')} href="#dashboard-section">
            ダッシュボード
          </Nav.Link>
        </Nav.Item>
        <hr />
        {Object.entries(groupedRequirements).map(([category1, subCategories]) => (
          <Nav.Item key={category1}>
            <Nav.Link 
              onClick={() => handleScrollTo(`category-${category1.replaceAll('/', '-')}`)} 
              href={`#category-${category1.replaceAll('/', '-')}`}
              className="fw-bold"
            >
              {Object.values(subCategories)[0]?.[0]?.category1_no}. {category1}
            </Nav.Link>
            <Nav className="flex-column ms-3">
              {Object.keys(subCategories).map((category2) => (
                <Nav.Item key={category2}>
                   <Nav.Link 
                    onClick={() => handleScrollTo(`category-${category1.replaceAll('/', '-')}`)} 
                    href={`#category-${category1.replaceAll('/', '-')}`}
                    className="small"
                  >
                    {subCategories[category2][0]?.category1_no}-{subCategories[category2][0]?.
      category2_no}. {category2}
                  </Nav.Link>
                </Nav.Item>
              ))}
            </Nav>
          </Nav.Item>
        ))}
      </Nav>
    </div>
  );
};

export default Sidebar;